# Core Layering — `read_file.ts` Split (PR-D) — Tasks

- **Slug**: `core-layering-read-file-split` · **PR-D**, the last of four
- **projectId**: `massa-ai` · **workflowSessionId**: `spec-core-layering-read-file-split`
- **Specify**: `spec.md` (`a866537`, `183573c`) · **Design**: `design.md` (`d7091ac`) — both on
  `spec/pr-d-read-file-split`, **not yet on `main`**
- **Base**: `main` @ `f06b01d` (the v1.17.0 release bump on PR-C's merge `2bea11e`)
- **Status**: **Tasks complete**, 2026-07-31. **Full Plan Challenge gate run** (~~§7~~ → **§8**; §7
  is *Risks*). ~~Execute not started.~~ → **Execute in progress — T1, T2, T3, T4a, T4b, T5 done**
  (§10.1–§10.6), **6 of 29 rows**, 23 remain. *Both struck clauses were already false when T5 read
  them and neither is T5's doing: the section pointer has been wrong since Tasks, and "Execute not
  started" since T1. T4b edited the bullet immediately below this one to correct 28/78 → 29/80 and
  left this line — a **status field and a section pointer in the same sentence**, both stale, in the
  header a reader checks first (§10.6).*
- ~~28 task rows~~ → **29 task rows** (T1–T25, with T4 split into T4a/T4b, two tasks the Plan
  Challenge gate added — T14b and T20b — and **T8b**, minted by C35 at T1 and given its §5 row at
  T4b), **eight phases**, ~~78~~ → **80 distinct files**. *The 28/78 pair was accurate as planned and
  went stale the moment Execute amended the plan; see §1's table and §10.5.*
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
| **2 — LRU** | ~~7~~ → **9** | 2 | `services/cache/lru-evict.ts` + its unit test + **4** repointed sites + `read-file.test.ts` + **T8b's 2 comment sites** |
| **3 — the extraction** | ~~13~~ → **14** | 12 | `read_file.ts` + **6** modules + **6** module suites + **C34's `read-file.test.ts` repoint** |
| **4 — `index_project.ts`** | **9** | 6 | 1 handler + **3** modules + 3 module suites + **2** test repoints |
| **5 — the gate goes green** | **1** | 0 | `.github/workflows/ci.yml` |
| **6 — the rename** | **29** | 0 | **7** `git mv` + **19** external importers + **3** prose/fixture sites |
| **7 — the record** | **16** | 1 | RFS-04's 5 + RFS-05's 9 + `design.md` (T20b) + `validation.md` |
| **sum** | ~~83~~ → **86** | **28** | |
| **distinct union** | ~~78~~ → **80** | | against PR-C's planned **104** and PR-B's **37** |

**Both figures are corrected at T4b (§10.5), and neither correction is T4b's own work** — they are
the two amendments §10 recorded without carrying back into this table. **C35** minted T8b with two
brand-new files (`production-wiring.ts`, `invalidator-registry.ts`), which appeared in no phase row;
**C34** added `read-file.test.ts` to T10, a file Phase 2 already carried. So the sum rises by 3 and
the union by 2 — C34's file is already inside the distinct set, and what it adds is a **sixth**
overlap rather than a seventy-ninth file. *An execute-time amendment that adds a file is a claim
about the planning table, and nothing was watching that table.*

**The phases are not disjoint, and the sum is not the review surface.** Measured: ~~**5**~~ → **6**
files are touched by two phases each, which is what takes ~~83 to 78~~ → **86 to 80**.

| overlap | files |
| --- | --- |
| Phase 0 ∩ Phase 1 (**1**) | **this document** — created at Phase 0, and T5 writes the frozen reading into it. Reported by the Plan Challenge gate (§8, evidence finding 2); the first draft's per-phase rows omitted it and it self-cancelled in the union, which is how it survived a check that only verified the total |
| Phase 2 ∩ Phase 3 (~~**1**~~ → **2**) | `packages/core/src/tools/read_file.ts` — the LRU repoint, then the extraction; and **`read-file.test.ts`** — T8's eviction repoint, then **C34**'s undefined-metadata repoint at T10 |
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
| `serialize.ts`, `serialize-interfaces.ts`, `index.ts` | n/a — no `IToolHandler` ~~class~~ | n/a | n/a |

Population premises re-derived at `d7091ac`, all holding: **30** tracked files under
`packages/core/src/tools/`, all `.ts`; **27** declare `handle()`; the same **27** name
`IToolHandler`; **3** declare neither. ~~Readings are `2 of 30` on the body/`Map` clauses and
`2 of 27` on the `handle()` clause, **the same two files**~~ → **amended by C42 (§10.6)**: `2 of 30`
is the **union of clauses 1 and 2**, not either one's reading. Per clause, measured at T5:
**clause 1 → `2 of 30`, clause 2 → `1 of 30`** (`read_file.ts` only; `index_project.ts` has **0**
state sites), **clause 3 → `2 of 27`**. The record must say that the third clause flags no file the
other two miss — its value is prospective (`design.md` §6.6 property 2) — and, as T5 measured, **so
does the second**: clause 2's RED set is a strict subset of clause 1's and clause 3's, and no
artifact said so. The *"class"* strike above is C40's population widening; the gate's own label lost
the word at T4b.

**Name the metric**: the baseline counts **maximal** bodies — a body not contained in another
flagged body. An AST walk descending into nested arrows reports **18** for `read_file.ts`, not 13.
*(**17** under the ctor-exempt convention the gate ships — C39, §10.4. Both figures are raw; the
maximal 13 is identical under either.)*

**Name the anchor too, which no artifact did until T5 (C43, §10.6).** The gate's spans are
**declaration-only**; the spans `design.md` §5.1 and §5's own task rows cite are **comment-inclusive
for `read_file.ts` and declaration-only for `index_project.ts`**. The two conventions coincide at 16
of the 26 cited spans because those members carry no preceding comment, which is why the split
survived Specify, Design and Tasks unremarked.

**And name which column is frozen, which C50 (§10.8) found is not the whole table.** This reading has
two kinds of cell — **counts** and **line spans** — and only the counts survive Phase 2.
RFS-01 AC-3's own text records a *verdict* (`2 of 30` red), and C46's *"byte-identical"* was measured
on `check-tools-thin`'s summary line, which carries counts. Measured at T7 through the gate's
`--json`: the delegate is net **−3 lines** in `read_file.ts`, so **15 of 15** entries move (13 bodies
+ 2 state sites) while **every count holds** at 13 / 17 / 2 / 175 and 25 members; `index_project.ts`
moves **0 of 3**. Five shift **+1** for the added import, seven shift **−3**, and `evictOldest` itself
goes `:477-483` (7L) → `:478-480` (3L). **A verifier re-taking this reading against the shipped tree
(§6 item 12, T25) must diff the counts and expect the spans to have moved** — T5's own record checked
those spans cell by cell at 72 assertions / 0 mismatches, so an unexplained 15 would read as a defect.

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
| **T2** | **The three containment shapes.** New file, passing against **pre-extraction** code: (a) request `path.dirname(<project root>)` with a `projectId` — the `rel.startsWith("..")` vs `"../"` narrowing, which **no existing test targets** (`dirname` does not occur in the suite); (b) construct **once**, read under one env state, mutate `MASSA_AI_READ_FILE_ROOTS`, read again on the **same instance** — the call-time-vs-construction-time hoist all 7 existing tests are blind to; (c) ~~assert the returned `absolutePath` carries no literal `..` segment~~ → **assert the resolved path is still under the project root** and that the **content served** is the in-root file's, independent of containment — **amended by C37 (§10.2)**: `path.resolve` normalizes `..` away on every exit, so the original assertion passes identically with and without `sanitizeFilePath` and was proven to survive its own mutation. **AC-2: the teaching-error text at `:443-447` is unchanged, roots only, never a host path** — and the assertion is on the enumerated **set**, since the existing suite's *"root present"* + *"`/etc/passwd` absent"* pair stays green under a `$HOME` leak (§10.2) | 1 new test file | **RFS-06 AC-1, AC-2, AC-3** |
| **T3** | **`handle()`'s presentation block characterized — authorship, not verification.** The fixture Design first cited for this is a **different tool's response** (`read-file-response.json`; 3 of 10 keys overlap and none of the moving ones). Pin `recommendations` — **0** assertions anywhere today — over ~~all 5 push sites~~ → **the 4 push sites** `:304`, `:318`, `:326`, `:333` **and their 4 strings** (2 plain literals, 2 template literals; `:282` is the initializer, not a push site — §3.4 and §8 finding 2 both carried the corrected figure while **this row did not**, §10.3). Pin `tokens` / `savingsPercent` / `compressionRatio`, ~~today reachable only through `e2e/08.search` and a live PostgreSQL~~ → **amended by C38 (§10.3)**: only `tokens` is e2e-reachable; `savingsPercent` **and** `compressionRatio` have **0** assertions anywhere, because the assertion `design.md` R-31 credits to `compressionRatio` belongs to `compress_context`. **Unit-level, no database** | 1 new test file | **R-31**, GMS-05 AC-1 |

**Phase 0 leaves the tree structurally identical.** `check-core-layering` must read **965 / 896**
unchanged, and `check-tools-thin` does not exist yet.

### Phase 1 — the gate, committed but not wired to CI

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T4a** | **`scripts/check-tools-thin.ts`** — three clauses over a **TypeScript AST**, never a regex: no function body declared anywhere in a file declaring an `IToolHandler` class except inside `handle()`'s own; ~~no `Map`/`Set` instance **or module-level** state~~ → **no `Map`/`Set` state at any of *three* sites — class field, module level, and `this.x = new Map()` assignment** (§10.4): the constructor is exempt from clause 1 **by kind**, so `private cache: unknown` plus `constructor() { this.cache = new Map(); }` declares no body and carries no `Map` in its own declaration, and a two-site clause 2 passes it; `handle()` body ≤ **120**. **File-scoped, not class-scoped** (C32) — a class scope is defeated by a constructor-body closure, which is none of AC-5's six shapes. **Zero allowlist entries, no exemption parameter, no suppression flag** (AC-2). **Prints its examined population on a PASS** (AC-1), on `check-core-layering.ts:277-282`'s `edgesExamined` precedent — *"a check that resolved nothing also reports zero violations, and the two must not read the same."* **Docblock names what it does not certify** (AC-6): a delegating `handle()` reads identically whether its delegate is correct or subtly wrong | 1 new script | **RFS-01 AC-1, AC-2, AC-6** |
| **T4b** | **`scripts/__tests__/check-tools-thin.test.ts`** — **synthetic fixtures only**, on `check-core-layering.test.ts`'s `mkdtemp` precedent, **never a live-tree count** (`design.md` §6.6 property 5): `bun test scripts/__tests__` auto-discovers and `ci.yml:200` runs it inside `build`, so a `2 of 30` assertion written here goes red at Phase 3 and makes §1.1's per-phase-green promise false. **Both directions observed red plus an inert control** (AC-4) — ~~and a legal public method staying PASS~~ → **the inert control is a file declaring no handler**, `design.md` §6.6 property 4's subject, because a public method is **RED** under C32 (**C41**, §10.5). **AC-5's fail shapes**: private method, public method, getter/setter, `static`, `#private`, arrow-function class property, module-level `const cache = new Map()`, object-literal handler, **the constructor-body closure**, and a `handle()` containing a string like `"unexpected token: {"` — the last because a careful and a naive brace counter are byte-identical on today's corpus, so the corpus **cannot falsify** a naive reimplementation. **Assert the nine member-kind classifications directly** so a `typescript` bump fails `test:scripts` rather than the gate (R-33) — but **derive them by running the gate, not by transcribing `design.md` §6.5's table**, which is `declaresBody()`'s truth table and not `BodyFinding.kind`'s (**C40**, §10.5). ~~1 new test file~~ → **2 files**: the object-literal shape read **PASS** against the gate as shipped, so closing AC-5 needs `check-tools-thin.ts` too | 1 new test file **+ 1 gate amendment** | **RFS-01 AC-4, AC-5** |
| **T5** | **RFS-01 AC-3's frozen base reading — the fourth non-retroactive step, first by dependency.** Run T4a's script after `git add`, record §3.3's table **per member with line spans** into this file. Not a test (§3.5 item 4, `design.md` §6.6 property 5) | this file | **RFS-01 AC-3** |

### Phase 2 — the LRU, behavior-preserving

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T6** | **`packages/core/src/services/cache/lru-evict.ts`** — an eviction **function** over `Map<K,V>`, not a cache class (AC-2), importing **nothing at all**. **AC-3's original property is gone**: `services/cache/` is not `kernel/`, so `check-core-layering`'s leaf-ness clause does not constrain it. The replacement is asserted by the module's own unit test, and that is a **real loss of CI enforcement**, recorded rather than glossed (R-29) — measured at T6, **total**: no mutation of the import property is visible to any characterization suite, before or after T7. **The signature is `(cache, maxRetained)`, a post-call bound, not `(cache, cap)` — amended by C44 (§10.7)**: `design.md` §5.1's phrasing does not determine the predicate, the five sites do not share one, and a single operator with each site passing its own literal cap is behavior-preserving at **neither** call position. Pre-insert callers pass `CAP - 1`, which is exact rather than a compromise, since `size > cap - 1` and `size >= cap` are the same predicate over integers | 1 new module + 1 new test | ~~**RFS-02 AC-2**, AC-3~~ → **RFS-02 AC-2 clause 1 ("an eviction function, not a cache class") and AC-3** — **amended by C47 (§10.7)**: AC-2's second clause, *"no site's TTL or read-promotion policy moves"*, cannot be closed by a module nothing calls; it is **T7's** |
| **T7** | **Repoint the four sites** — `read_file.ts` (**3** call sites: `:169`, `:462`, `:570`, §3.5 item 6), `symbol-graph.service.ts:808`, `web-controller.ts:138`, `file-filter-cache.ts:82`. **No site's TTL or read-promotion moves.** T1's suites must pass **unmodified** — assert byte-identity by SHA-256 across the commit, on `validation.md` §1's evidence shape, not "the tests are green now". **Take the delegate shape — added by C46 (§10.7), and it is a frozen-base decision rather than a style one.** Keep `private evictOldest<K,V>(cache)` on `ReadFileTool` as a one-line call into the module; do **not** delete it and inline the three call sites. Measured: inline leaves `read-file.test.ts` at **6p/1f** until T8 lands **and** moves RFS-01 AC-3's frozen base mid-Phase-2 (`read_file.ts` 13 → **12** maximal bodies, 224 → **223** members examined), which §3.1's *"unchanged between T5 and T9"* guarantees only for the **file population**, not for the per-member table AC-3 froze. Delegate leaves both **byte-identical** — ~~in every respect~~ → **in every count, and in none of the spans (C50, §10.8)**: `read_file.ts` holds 13 / 17 / 2 / 175 and 25 members while **15 of 15** frozen entries shift, `evictOldest` itself `:477-483` → `:478-480`. **Pre-insert sites pass `CAP - 1`** and the two post-insert sites pass `CAP` (C44). **The delegate shape applies at `symbol-graph.service.ts` too — added by C48 (§10.8), and this row's `:808` citation is the `while` guard *inside* a private wrapper the row did not know existed.** `symbol-graph-service.test.ts:787-812` reaches `evictOldestProjectRoot` through a cast exactly as `read-file.test.ts` reaches `evictOldest`; inlining leaves it **48p/1f** with **no task owning the repoint**, since T8's write set is `read-file.test.ts` alone. `check-tools-thin` does not move at that site either way — the file is under `services/` — so the exposure is §1.1 and GMS-05 AC-3, not the frozen base. `web-controller.ts` has no wrapper and is inlined by necessity; `file-filter-cache.ts` keeps its own. **Its `logger.debug` at `:154` is dropped and priced in the site's docblock — decided by the user, 2026-08-01**, against keeping it behind a victim-naming wrapper | 4 files | **RFS-02 AC-1**, and **AC-2 clause 2** (*"no site's TTL or read-promotion policy moves"*) — reassigned here by **C47** |
| **T8** | **Repoint `read-file.test.ts`'s eviction test** (~~`:264-272`~~ → **`:264-299`**, `describe` `:257-300`), which reaches four private members ~~and cannot survive T7 unmodified~~. **Both amended at T6 (§10.7).** The span: C34 measured `:264-299` at T1 and corrected only §10.1's prose, leaving this row wrong for five tasks — the fifth correction on this feature to land in one document and not in the row it is about. The clause: **falsified by measurement** — under T7's delegate shape (C46) the test passes **7p/0f/34x, byte-identical to baseline**, because ~~all four members it reaches~~ → **all three members it exercises (C51, §10.8: the cast at `:265-270` declares four; `projectRootCache` at `:267` has zero references in the body)** still exist. Confirmed at T7: byte-identical and green, `e8cf74c6881db255`. It survives T7 and is repointed here anyway, because Phase 3 removes its subject. **GMS-05 AC-3: repointed, not weakened, skipped or deleted** — the CAP+1 eviction and hot-key-promotion assertions must still run, against the module. ~~**It is also the only non-vacuous sensor for `fileCache` eviction until this task runs** (C45)~~ → **amended by C49 (§10.8): it is the only non-vacuous sensor for the `evictOldest` *method*, and no sensor at all for the *call sites*.** Measured across all 92 cases in the six eviction suites: deleting `read_file.ts:570` (`fileCache`) or `:169` (`projectRootCache`) leaves **92p/0f — nothing goes red**, because this test calls `tool.evictOldest(tool.fileCache)` directly and never drives `readFileWithCache`. **This task's subject widens to close that** — **decided by the user, 2026-08-01**, from three options; recording only and a new task T8c were rejected. Besides the repoint it must **drive `handle()` past the cap and drive `indexing:started`, asserting the cache is bounded** — call-site sensors for `:570` and `:169`, landing before **T10** moves `:570`'s call into `services/file-read/file-content-cache.ts` with nothing watching. Write set is still **1 file**; §5's task count is still **29** | 1 file | GMS-05 AC-3, **C49** |
| **T8b** | **The two comments RFS-02 AC-4 requires corrected — `production-wiring.ts:67-68` and `invalidator-registry.ts:34-36`.** Both state the same false claim and the **named site cites the unnamed one as its authority**, so correcting only the named one leaves a reader who follows its own pointer at the uncorrected claim (**C35**, §10.1). Corrected to state what T1's pin measured: `CACHE_TTL` is enforced, `ROOT_CACHE_TTL` is **not**, and no invalidator id matches `read_file`. **Added by C35 at T1; this row was created at T4b** — C35 resolved the defect and named the task but never wrote a row for it, so for four tasks T8b existed only in §10.1's prose and was absent from §5 and from §1's write-set table (§10.5) | 2 files, comments only | **RFS-02 AC-4** |

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
| **T13** | **`executeIndexing` ~~`:254-351`~~ → `:246-351` → `services/indexing/execute-indexing.ts`.** **Amended by C43 (§10.6)**: the cited span is declaration-only and leaves the member's own 8-line doc comment `:246-253` orphaned in `index_project.ts`, describing code that no longer lives there. `design.md` §5.1's own **~110** LOC estimate for this module is the tell — the comment-inclusive span is **106** and the declaration-only one **98**. Outside `handle()` either way, so **C33's conclusion does not move**. It is `private` and has **0** importers — the only occurrences outside the file are **5 non-code mentions** in `index-project-tool.test.ts` — a JSDoc line (`:4`), a `test()` **title string** (`:312`) and three `//` comments (`:313-315`) — so no test repoints for this move. *(The first draft said "three comments"; the gate corrected it, §8 evidence finding 3. The conclusion is unchanged and slightly stronger: none of the five is an import.)* **It is not a pure function: `:306` reads `this.contextualSearch`, the sole `this.` reference in the span. It takes a bound `warmupCache` callback — §4.2**, decided here because no artifact named the dependency | 1 handler + 1 new module + 1 new suite | GMS-02 headline |
| **T14** | **The two module-level helpers C32's file scope surfaces → `services/project-identity/project-root-identity.ts`** — `canonicalizeProjectRoot` `:39-44` and `assertProjectRootReuse` `:46-68`. `spec.md` §4.2 names **1** body in this file; measured there are **3**. Both are already imported by name in `index-project-identity.test.ts` and `index-project-tool.test.ts`, so it is **2 import repoints and no test rewrite**. **Not a published-surface change**: `tools/index.ts` re-exports only `IndexProjectTool` (`:5`) and `ReadFileTool` (`:37`), so neither helper is on `@massa-ai/core/tools`. RFS-04's semver framing does not reach this task | 1 handler + 1 new module + 1 new suite + 2 test repoints | — |
| **T14b** | **The managed-run lease acquisition ~~`:158-202`~~ → `:151-202` → `services/indexing/`. Without this task the gate cannot reach `0 of 30` — C33, §3.6.** **Amended by C43 (§10.6), and this one is gate-relevant rather than tidiness**: the cited span is statement-only and leaves the 7-line `// ── Wave 5 FR-09:` block `:151-157` behind — **inside `handle()` `:117-244`**, whose span the gate measures **including comment lines**. So the planned `128 → ~87` lands at **~94** if the comment stays, eating 7 of the 33 lines of margin this row prices. No artifact mentioned this comment at all. ~~45~~ → **52** lines: `eventId`, `ManagedRunRepositoryPg.getInstance()`, `begin()`, the `"busy"` branch, the `catch`, and the `lease` assignment. **The module returns a discriminated result and `handle()` maps it to a `ToolResponse`** — the two early returns at `:175-186` and `:198-201` are response *shaping* and stay in the handler, so no `services/` module imports `tools/serialize.ts` (RFS-03 AC-2). `handle()` **128 → ~87**, 33 lines under the ceiling. **Closed by removal, zero allowlist** — §4.2's own principle, and this block is managed-run orchestration by any reading, so it is on-requirement rather than scope creep. **Decided by: the user, 2026-07-31**, from three options with their measured consequences | 1 handler + 1 new module + 1 new suite | **RFS-01 AC-1**, GMS-02 headline |

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
| **T25** | **Independent validation — author ≠ verifier**, on PR-C's T18 and PR-B's T20 precedent. Re-derives every criterion from raw data rather than from this file. **Must re-take, not inherit**: T5's frozen reading against the shipped tree, Phase 6's resolver sweep, `check-core-layering`'s `edgesExamined` per structural commit, the `npm pack --dry-run`, and a **discrimination table** on the real tree — each subject backed up to a **scratch copy** with SHA-256 byte-identity asserted on restore. **Never `git checkout` to restore**: it restores to `HEAD`, not to pre-mutation state, and destroyed two files of uncommitted work at PR-C's T8b. **Two open questions to answer rather than inherit, both amendments to criteria rather than to figures:** whether **C37**'s replacement predicate for RFS-06 shape (c) (§10.2) is the right reading of *"independent of containment"*, given the original clause was struck for being unfalsifiable; and whether AC-2's enumerated-**set** assertion is what *"roots only, never a host path"* requires, given the existing suite's presence/absence pair stays green under a `$HOME` leak | 1 new file | GMS-02, RFS-01…RFS-06 |

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
| 2 | R-31's *"5 `recommendations.push` sites"* counts the array initializer. The internal tell — 5 sites, 4 literal strings — survived two prior gates | medium | **CONFIRMED.** `:282` is `recommendations: []`; the `.push(` calls are `:304`, `:318`, `:326`, `:333` = **4** | ~~**T3** corrected~~ → **§3.4 corrected; T3's own row was NOT**, and this landed column asserted otherwise until T3 ran (§10.3). Owed back to `design.md` R-31 (T20b) |
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
| 2 | `design.md` **`:930` and `:1042`** (R-31's prose *and* §11 item 4) | **4** `recommendations.push` sites, not 5 — `:282` is the initializer. **Both sites, not one**: T3 measured that the "five" figure is stated at two places in `design.md`, and this row named only R-31 (§10.3) |
| 7 | `design.md` R-31's per-key table | **C38** — `compressionRatio` is **0** assertions, not ×1: the credited `e2e/08.search:556` is `compress_context`'s `metadata.compressionRatio`, a different tool and a different path. `tokens` is **2**, not ×1 (`:675`, `:676`), and both sit behind a `catch { return }`. Also *"only four suites exercise `ReadFileTool`"* — `apps/tools-api/src/routes/file.test.ts` predates `design.md` and names it, though it mocks the class wholesale (§10.3) |
| 3 | `design.md` §5.1 module 8 | `executeIndexing` reads `this.contextualSearch` at `:306`; the module table presents it as free-standing |
| 4 | `design.md` R-32 | **3** files shared between Phase 6 and Phase 7, not 1 |
| 5 | `design.md` §7 group G | *"6 stale statements"* → **1**; RFS-05 AC-1's six were closed by the Specify commit |
| 6 | `design.md` §6.6 property 1 | the gate's own files are outside its population whether tracked or not; the stated mechanism does not apply |
| 8 | `design.md` §6.5 (*"an AST walk that descends into nested arrows reports **18**"*) and §6.6 property 2 | **C39** — the raw body figures for the two RED files are measured under **two different constructor conventions**. `read_file.ts`'s **18** counts the constructor; `index_project.ts`'s **3** does not. Under one convention the pair is 18 / 4, under the other 17 / 3; **18 / 3 is a pair no single convention produces**. §6.5's named nested list is also short by one — 13 + the 4 named arrows is 17, and the fifth item is the constructor entry, which is not a nested arrow. **The maximal figures 13 and 3 are identical under both conventions**, so RFS-01 AC-3's frozen base is untouched (§10.4) |

| 9 | `design.md` §6.5's rule box and §6.4 item 3 | **C40** — the rule box reads *"In a file declaring a class that implements `IToolHandler`"*, and §6.4 item 3 concludes from *"0 files declare a `handle(` without a class"* that the object-literal shape needs no handling. Measured at T4b: an object literal carrying a 200-line `handle()` **and** a module-level `Map` reads **PASS**, which is the disposition RFS-01 AC-5's own last sentence forbids. The population admits an object literal claiming the interface by annotation, `satisfies` or `as` (§10.5) |
| 10 | `design.md` §6.6 property 4 | **C41** — it names `serialize.ts` as AC-4's inert control while `spec.md` AC-4 names *"a legal public method"*, and substitutes one for the other **without striking the clause it replaces**. The two are not the same subject: one is a file with no handler, the other a member of a green one, and only the first behaves as claimed (§10.5) |
| 11 | `design.md` §6.5's nine-case table (`:775-785`) | **C40** — the table is the truth table of `declaresBody()` for the **member** node and is not a table of `BodyFinding.kind`; the two diverge for an arrow-function class property, whose flagged node is the nested `ArrowFunction`, reported as `kind: "ArrowFunction"` and **not** `PropertyDeclaration`. The table is also silent on `SetAccessor`, a distinct `ts.SyntaxKind` the gate handles. **Second figure in this table not to survive being re-run**, after C39 (§10.5) |
| 12 | `design.md` §6.4 item 4 | **C40** — the named fixture, a `handle()` containing `"unexpected token: {"`, discriminates against a naive brace counter at **exactly one span** (120, where the counter overshoots to 121). The `}` form discriminates across the whole range above the ceiling. Sized wrong, the named fixture is inert — the mutation-resolves-to-nothing class this feature recorded at T3 (§10.5) |

| 13 | `design.md` §6.6 property 2 (`:810-813`) | **C42** — *"the reading is `2 of 30` on the body/`Map` clauses and `2 of 27` on the `handle()` clause"* states a **union** as if it were a per-clause reading. Measured at T5: clause 1 → `2 of 30`, clause 2 → **`1 of 30`** (`read_file.ts` only), clause 3 → `2 of 27`. `index_project.ts` carries **0** state sites. The property's own *"a third clause that flags no file the other two miss"* note therefore applies to the **second** clause as well, and it is stated only of the third (§10.6) |
| 14 | `design.md` §5.1 module 8 (`:457`) and the module table's span convention | **C43** — the cited spans are **comment-inclusive for `read_file.ts` and declaration-only for `index_project.ts`**, unstated and mixed per file. Module 8's `executeIndexing` `:254-351` orphans its 8-line doc `:246-253`, and §5.1's own **~110** LOC estimate is the tell: comment-inclusive is **106**, declaration-only **98**. The same defect reaches `tasks.md`'s own T14b row, where the orphaned comment sits **inside** the `handle()` the ceiling measures (§10.6) |

| 15 | `design.md` §5.1 module 1 (`:450`) | **C44** — *"a function taking `(cache, cap)`"* does not determine the predicate, and the five sites do not share one: three evict pre-insert on `>=`, two post-insert on `>`. Measured at T6 against T1's oracle through a full prospective repoint: one operator with every site passing its own literal cap **fails in both directions** — shared `>` breaks the three pre-insert sites (3p/2f), shared `>=` breaks the two post-insert ones (3p/2f). The shipped contract is a **post-call bound** `(cache, maxRetained)`, with pre-insert callers passing `CAP - 1`; it is exact rather than a compromise, because `size > cap - 1` and `size >= cap` are the same predicate over integers. `spec.md` §3.B's *"retain the same number"* is a statement about five sites keeping their **own** operators, not about one they share (§10.7) |

These are **T20b**. ~~Six~~ → ~~fourteen~~ → **fifteen** corrections; the count in `HANDOFF.md` and
`STATE.md` was last true at Design.

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

### 10.2 T2 — executed, 2026-07-31

One new file, `packages/core/src/__tests__/read-file-containment-shapes.test.ts` — **6 cases in 4
describes, 31 assertions**, authored against the unmodified tree. RFS-06 **AC-1, AC-2 and AC-3 all
close**; AC-3 is closed by shape (b) rather than by a test of its own, because the property it names
(*"the env allowlist is still read at call time"*) has no witness other than a call-time observation.

#### C37 — the forty-second plan defect: shape (c)'s prescribed assertion cannot fail

`spec.md` §5 RFS-06 row 3 and this document's own **T2(c)** both specify the third test as
*"assert the returned `absolutePath` carries no literal `..` segment, independent of containment."*
**That assertion is vacuous.** `resolveFilePath` has exactly two non-null exits — `:370`
`return path.resolve(filePath)` and `:379` `return path.resolve(root, cleaned)` — and `path.resolve`
normalizes `..` away unconditionally. Measured over nine adversarial inputs (over-traversal,
`....//`, backslash forms, absolute-input escape): **every result carried zero `..` segments,
including the ones that resolved outside the root.**

**Proven by execution, not by argument.** A probe suite written to the criterion's letter was run
against the tree and then against **P3**, the mutation that drops `sanitizeFilePath` from
`resolveFilePath`'s projectId branch:

| | verdict |
| --- | --- |
| prescribed literal-`..` assertion, unmutated | **PASS** 1p/0f |
| prescribed literal-`..` assertion, **under P3** | **PASS** 1p/0f — survives the mutation it exists to catch |

So a T2 authored to the letter of the criterion would have read green while RFS-06 AC-1's claim
that the three tests *"prove they hold today"* was **false for shape (c)**. This is **C21's class —
a sensor reading PASS by not looking — inside the requirement written to close exactly that class**,
and it is the fifth time on this feature that a correction inherited the defect it was correcting.
It is also C33's shape one artifact down: a clause and the work meant to close it must act on the
same lines, and here the clause and its subject did not overlap at all.

**Resolution — the predicate is containment-relative, not lexical.** The test asserts the resolved
path is still **under the project root** (`path.relative(root, absolutePath)` does not start with
`..`), that it equals the sanitized resolution exactly, and that the **content served** is the
in-root file's rather than the escaped one's. Measured: `escapes root: false` today, `true` under P3.
*"Independent of containment"* is honoured literally — the escaped directory is put on
`MASSA_AI_READ_FILE_ROOTS` so containment permits **both** candidate paths and cannot be what fails;
a companion case reads the escaped file directly to prove the allowlist really admits it, so
*"the read stayed in the root"* and *"the parent's file was unreadable anyway"* are not the same
observation.

**Recorded at author level, not put to the user**, on the C34/C35 precedent: RFS-06 AC-1 plus
RFS-01 AC-4 (*"a new sensor is not quotable until it has failed on purpose"*) fix the answer, and
only the replacement predicate was open. **The vacuous assertion is deliberately not written, and
the file's header records why** — so the next reader does not re-add it believing it was forgotten.
**Owed back to `spec.md` §5 RFS-06 row 3 and to T2's own row** (T20's write set covers the parent;
the two PR-D-local edits land with the record). **Handed to T25 as a question rather than as a
settled fact**, because it amends a criterion rather than a figure. Running total: **forty-two**
plan defects.

#### The Plan Challenge gate on T2 — two modes, eight findings

Both lenses read-only; `git status --porcelain` checked after each returned rather than trusting the
agents' own reports. **The evidence audit re-derived every span, quote and count in `spec.md` and
`design.md` and none failed** — the first artifact on this feature with zero non-reproducing figures.
`read_file.ts` is byte-identical across `f06b01d`, `d7091ac` and HEAD, so spans measured at either
commit still hold. Five red-team findings changed the file before it was written:

| # | finding | disposition |
| --- | --- | --- |
| 1 | shape (a) and shape (c) fixtures collide | **CONFIRMED and worse than reported.** `dirname(mkdtempSync(os.tmpdir(), …))` **is** `os.tmpdir()` — measured — so distinct roots do not separate them and shape (c)'s allowlist entry would *be* the directory shape (a) asserts is rejected. Fixed structurally: **a private container per shape**, `root = join(container, "ws")`, plus an in-test tripwire asserting the env is empty before shape (a) runs |
| 2 | no `try/finally` discipline stated for the two env mutations | **CONFIRMED.** bun runs a file's tests sequentially in one process, so a throw leaks `MASSA_AI_READ_FILE_ROOTS` into the next test. `try/finally` per mutation **plus** an `afterEach` hard reset **plus** `beforeAll`/`afterAll` save-and-restore of the ambient value |
| 3 | the live-LLM edge is `CodeCompressor`, not `vector-store-factory` | **CONFIRMED.** `llm.enabled: true`, `http://localhost:11434/v1` on this machine; `SymbolGraphService` is never constructed here so the vector path is never reached. Every `handle()` call passes **`compress: false`** and every fixture is one line |
| 4 | the stated reason for shape (b)'s two directions is wrong | **CONFIRMED by simulation.** Direction A alone kills the construction hoist **and** the naive first-call memo; **direction B is what kills a sticky non-empty memo**. Both are kept — the rationale in the file is corrected, not the design |
| 5 | `process.cwd()` must be read live | **CONFIRMED.** `/…/massa-ai` under a manual `bun test` from the repo root vs `/…/massa-ai/packages/core` under `bun run test`. A hardcoded root would pass one invocation and fail the other |

**One finding the gate reported as duplication and it is not.** The audit noted that
`read-file-containment.test.ts:95-128` already asserts `/path containment/i`, `/Valid roots/i`, both
roots present and `not.toContain("/etc/passwd")`, and read AC-2's test as restating them. Those
assert each root is **present** and that one hardcoded string is **absent** — neither establishes
*"roots only, never a host path"*. **Measured: under P4, which leaks `$HOME` into the enumerated
list, the existing suite stays PASS.** AC-2's test asserts the enumerated **set** equals exactly
{project root, cwd} ∪ env roots, and that is what earns it its place.

#### The suite's discrimination, on the real tree

Backed up to scratch copies with SHA-256 byte-identity asserted on restore, refuse-on-anchor-not-found
and refuse-on-byte-identical on every patch, **never `git checkout`**. **The existing 7-test suite was
run under every mutation as well**, because RFS-06's load-bearing premise is that it does *not* kill
these shapes — inherited from the requirement, never measured until now.

| # | mutation | expected | new suite | existing suite |
| --- | --- | --- | --- | --- |
| P1 | `rel.startsWith("..")` → `startsWith("../")` | FAIL | **FAIL** 4p/2f | PASS 7p/0f |
| P2 | env allowlist hoisted to construction time | FAIL | **FAIL** 5p/1f | PASS 7p/0f |
| P3 | `sanitizeFilePath` dropped from `resolveFilePath` | FAIL | **FAIL** 5p/1f | PASS 7p/0f |
| P4 | teaching error leaks `$HOME` into the root list | FAIL | **FAIL** 5p/1f | PASS 7p/0f |
| P5 | comment-only edit (**inert control**) | PASS | **PASS** 6p/0f | PASS 7p/0f |

**Every row landed as expected**, 1/1 files byte-identical afterwards, and the control's assertion
count reproduced exactly (31) either side. **The existing suite is blind to all four** — RFS-06
claimed this for shapes (a)–(c) and never checked it; P4 extends it to a shape RFS-06 never claimed.

**Shape (a)'s discriminator is unique, and that is a property of path semantics rather than of the
fixture.** `path.relative(root, target)` is the bare string `".."` for **exactly one** target,
`path.dirname(root)`. A file in the parent gives `"../secret.txt"` and a prefix-named sibling gives
`"../ws-evil/f.txt"`; both are rejected under either reading. Under P1 containment *allows* the
parent and the failure becomes a generic read error on a directory, so the assertion is on the
error's **shape** — the teaching error, and explicitly not `EISDIR`.

#### Four hostile-precondition runs, and one assertion proven non-vacuous

The deterministic falsifier the gate named, run rather than argued:

| precondition | result |
| --- | --- |
| `XDG_CONFIG_HOME=$(mktemp -d)` — no developer config, `llm.enabled` absent | 6p/0f, **75 ms** |
| `MASSA_AI_READ_FILE_ROOTS=/tmp:/var/folders` pre-set (simulated leak) | 6p/0f, 31 expects |
| invoked from `packages/core/` rather than the repo root | 6p/0f |
| repeat run | 6p/0f, 31 expects — identical |

The second passing is only *correct* because `beforeAll` neutralizes the ambient value, which means
shape (a)'s own tripwire never fired — **an assertion never observed red is the C37 class again**.
Checked: with the `beforeAll` delete removed and the hostile env pre-set, the suite reads
**5p/1f at `:160`**, restore byte-identical, back to 6p/0f.

#### Gates, all six plus the layering gate

`lint` exit **0** — and proven to bite rather than assumed: a duplicate-declaration probe appended to
this very file produced `error: Identifier \`dupProbe\` has already been declared` and exit **1**,
restored SHA-256-identical, lint back to 0. **oxlint is the only gate that sees this file at all** —
`packages/core/tsconfig.json` excludes `src/__tests__`, so `tsc` structurally cannot type-check it.
`type-check` **6/6, 0 cached** (forced — the unforced run reported 2 cached and a replay is not a
measurement). `build` **5/5, 0 cached**. `test` **11/11 tasks, 0 cached, 367 isolation groups**, and
the new suite confirmed *inside* it as `[test-isolation] PASS: isolated (module mock)` rather than
only standalone. `test:scripts` exit **0**, 1018 pass / 0 fail across 48 files. `test:plugins` exit
**0**, 96 pass / 0 fail across 8 files.

**`check-core-layering` after `git add`: `PASS — 0 violation(s) across 965 tier-to-tier edges in 899
tracked files`.** Read it as **edges 965 unchanged; files 898 → 899** — C36's distinction, applied
rather than rediscovered. Phase 0 adds no tier-to-tier edge; the population rises by the one tracked
code file T2 adds.

### 10.3 T3 — executed, 2026-08-01

One new file, `packages/core/src/__tests__/read-file-presentation-characterization.test.ts` — **9
cases in 1 describe, 46 assertions**, authored against the unmodified tree. **R-31 and GMS-05 AC-1
close.** Unit-level, no database, no live LLM: **91 ms** standalone. **Phase 0 is complete.**

#### C38 — the forty-third plan defect: R-31's per-key table credits another tool's assertion, and the field it credits has none

`design.md` R-31's replacement table states, for the token-math segment `:285-322`:
*"`tokens` ×1, `compressionRatio` ×1 — **both only `e2e/08.search`**"*. **Both figures are wrong,
and one reverses the segment's verdict.**

| field | R-31 | measured | why |
| --- | --- | --- | --- |
| `compressionRatio` | ×1, e2e-only | **0, anywhere** | the only `compressionRatio` assertion in `e2e/08.search.test.ts` is `:556`, inside test **F28**, which calls `compressContext(...)` and reads `r.metadata.compressionRatio`. `ReadFileTool` assigns it at the **top level** of `data` (`read_file.ts:303`) and never under `metadata` (`:275-280` carries only totalLines/language/symbols/imports). **Different tool, different path — it can never observe this field** |
| `tokens` | ×1 | **2** | `e2e/08.search.test.ts:675` and `:676`, in F32. Neither has `.tokens` as its literal receiver — the field is read into plain consts at `:673-674` — and both sit **after** a `try/catch` whose `catch` does `return` (`:652-668`), so an LLM timeout **skips them silently** rather than failing |
| `savingsPercent` | 0 | **0** | reproduces; zero occurrences in any tracked test file |
| `recommendations` | 0 | **0** | reproduces; the 8 `expect(res.recommendations…)` hits in the tree are all `search-controller.test.ts`, a different subject |

So the ❌ **unguarded** row is larger than R-31 states: `recommendations`, `savingsPercent` **and**
`compressionRatio` all have **0** assertions anywhere. Only `tokens` has any, only through a
live-PostgreSQL e2e suite, and only when the LLM path is fast enough to reach them.

**This is R-31's own defect class a second time.** R-31 was rewritten because it cited **a different
tool's fixture** (`read-file-response.json`) as evidence — *"the one artifact in this document that
was cited as evidence without being opened"*. Its replacement table then credited **a different
tool's assertion**. **Sixth time on this feature that a correction inherited the defect it was
correcting**, and the second time inside R-31 specifically.

**Recorded at author level, not put to the user**, on the C34/C35/C37 precedent: it **enlarges** T3's
subject rather than changing it — more unguarded, not less — and R-31 plus GMS-05 AC-1 fix the
answer. Owed back to `design.md` R-31 (**T20b**, §8.1 row 7). It is *not* owed to the parent
`spec.md`: R-31 is a Design-introduced risk with no parent criterion behind it. Running total:
**forty-three** plan defects.

#### The population R-31 names is short, and the conclusion survives it

R-31 says *"the only four suites that exercise `ReadFileTool`"*. Measured over all **413** tracked
test files: `apps/tools-api/src/routes/file.test.ts` also names it and **predates `design.md`**
(added `3acf3ae`, 2026-07-25, six days before the Design gate) — so the figure was already wrong
when it was written, independently of the three suites T1 and T2 have since added. But it does
`mock.module("@massa-ai/core")` with `ReadFileTool: class {…}` (`:11`, `:23`), replacing the class
wholesale, exactly as `workspace.test.ts:31` does. **Both exercise route delegation and never reach
this block**, so R-31's count is short while its conclusion is untouched. Recorded rather than
escalated; folded into §8.1 row 7.

#### §8 finding 2's *"landed"* column was false, and the correction it claims had no owner

§8's evidence-audit row 2 records the 5-vs-4 push-site correction as *"**T3** corrected"*. Measured
at HEAD before T3 ran, **three sites still stated five**:

| site | text |
| --- | --- |
| `design.md:930` | *"The five `recommendations.push` sites (`:282`, `:304`, `:318`, `:326`, `:333`)"* |
| `design.md:1042` | *"`recommendations` (0 assertions anywhere, 5 push sites, 4 literal strings)"* |
| `tasks.md:444` — **T3's own row** | *"over all 5 push sites and their 4 literal strings"* |

The correction reached **§3.4 only**. And §8.1 row 2 — T20b's list — named *"`design.md` R-31"*, one
line item against **two** `design.md` sites, while `tasks.md:444` is outside that table's declared
scope (*"Corrections owed to `design.md`"*) and therefore **had no scheduled owner at all**. That is
PR-C's **C19** shape: a correction owned by nothing. All three are now struck-and-amended in place —
T3's own row and §8's landed column here, the two `design.md` sites by T20b as widened.

*The rule this earns: a landed-column entry is a claim about another part of the document, and it
goes stale exactly like a status field. Verify it against the cited line, not against the intent.*

#### The suite's discrimination, on the real tree

Backed up to a scratch copy with SHA-256 byte-identity asserted on restore, refuse-on-anchor-not-found
and refuse-on-byte-identical on every patch, **never `git checkout`**. **The six existing suites that
exercise `ReadFileTool` were run under every mutation as well** — R-31's load-bearing premise is that
they do *not* guard this block, and like RFS-06's it was inherited from the risk row and never
measured. Harness `~/prd-exec-instruments/t3-mutations.ts`.

| # | mutation | expected | new suite | existing 6 |
| --- | --- | --- | --- | --- |
| Q1 | `:325` usage-tip guard `&&` → `\|\|` | FAIL | **FAIL** 7p/2f | PASS 51p/0f |
| Q2 | `:317` large-file tip `> 100` → `>= 100` | FAIL | **FAIL** 8p/1f | PASS 51p/0f |
| Q3 | `:254` `shouldAutoCompress` `> 100` → `>= 100` | FAIL | **FAIL** 8p/1f | PASS 51p/0f |
| Q4 | `:303` `compressionRatio` assignment deleted | FAIL | **FAIL** 8p/1f | PASS 51p/0f |
| Q5 | `compressionRatio` also set on the else branch | FAIL | **FAIL** 7p/2f | PASS 51p/0f |
| Q6 | `:301` `savingsPercent` `Math.round` → `Math.floor` | FAIL | **FAIL** 7p/2f | PASS 51p/0f |
| Q7 | `:300` `saved: original - compressed` → `0` | FAIL | **FAIL** 8p/1f | PASS 51p/0f |
| Q8 | `:324-336` usage-tip and symbol-tip blocks swapped | FAIL | **FAIL** 8p/1f | PASS 51p/0f |
| Q9 | `:327` literal text `60%` → `50%` | FAIL | **FAIL** 6p/3f | PASS 51p/0f |
| Q10 | `:292` `estimateTokens(selectedContent)` → `(content)` | FAIL | **FAIL** 7p/2f | PASS 51p/0f |
| Q11 | `:332` `definitions > 0` → `>= 0` | FAIL | **FAIL** 8p/1f | PASS 51p/0f |
| Q12 | comment-only edit (**inert control**) | PASS | **PASS** 9p/0f | PASS 51p/0f |

**Every row landed as expected**, 1/1 file byte-identical afterwards, and the control's assertion
count reproduced exactly (46) either side. **The existing six are blind to all eleven** — R-31
asserted this for `recommendations` and never checked it, and it now holds for the token math and
the branch boundaries too.

**Two mutations are live only because a case was added for them, and that is the point of
enumerating them 1:1 before authorship.** `> 100` → `>= 100` (Q2, Q3) differs from `> 100` at
**exactly one** selection size, so with fixtures of 3 / 10 / 150 selected lines both mutations
resolve to nothing and would have read as a gate that catches nothing. The exactly-100 case exists
for them. Likewise Q6: at most fixture sizes `Math.round` and `Math.floor` agree — at the first
fixture tried they were **both 98** — so the compressed output is sized to **480 chars → 120
tokens** against a 920-token selection, where `round` gives **87** and `floor` gives **86**.
*A mutation that resolves to nothing reads exactly like a sensor that cannot see it.*

#### The Plan Challenge gate on T3 — two modes, and five findings changed the file before it was written

Both lenses read-only; `git status --porcelain` checked after each returned rather than trusting the
agents' own reports. Five pre-mortem/red-team findings, **all five accepted**:

| # | finding | disposition |
| --- | --- | --- |
| 1 | cases 4 and 5 omit the explicit-range precondition case 1 states | **CONFIRMED.** `calculateRange` (`:503-506`) returns `{start:1, end:Infinity}` on any default read, so `:326` co-fires and an exact-array assertion would have been relaxed to `.toContain()` mid-authorship — R-26's failure mode exactly. Both cases now pass an explicit `lineStart`/`lineEnd` and assert exact array equality |
| 2 | fixture line counts are not guaranteed at the >100 boundary | **CONFIRMED.** `"a\nb\n".split("\n")` has length 3, so a trailing newline silently moves a fixture across the branch. **Every case now pins `lineRange.actual.total` and `lineRange.selected`**, and `makeLines` joins without a trailing newline |
| 3 | the 8 mutations were an unenumerated count | **CONFIRMED and acted on.** Enumerated 1:1 against the cases before authoring — which is what surfaced that Q2/Q3 and Q6 were dead at the first fixture sizes (above). Shipped as 11 + control |
| 4 | `mock.module` survives T12 — verified rather than assumed | **CONFIRMED by scratch repro**: a mock registered from `__tests__/` binds an importer one directory deeper, because bun keys on resolved module identity, not on the literal specifier. R-28's failure mode is the *target* moving, not the *importer* |
| 5 | no case proves the `try/catch` boundary survives the extraction | **CONFIRMED as a gap.** `:287`'s await is the only throwing call in the moved span, and after T12 it lives in module 7 while the catch stays in the handler. A ninth case was added: the mocked compressor rejects, and the response is `{success:false, error:"Failed to read file: compressor exploded"}` |

**The evidence audit re-derived every figure and two did not reproduce, both in this packet's own
statements rather than in the artifacts.** `savingsPercent` occurs **3** times in `read_file.ts`
(`:301` assign, `:305` read inside the `:304` template, `:313` assign) — the two *assignment* sites
were right and the occurrence list was short. And the `tokens` figure was restated from R-31 as ×1
when it is **2**; the audit caught it inside the very finding correcting R-31's other figure.
*Thirteenth time on this feature that a critic's mechanism held while a figure did not — this time
the author's.*

#### Gates, all six plus the layering gate

`lint` exit **0** — and proven to bite rather than assumed: a duplicate-declaration probe appended to
this very file produced `error: Identifier \`dupProbeT3\` has already been declared` and exit **1**,
restored SHA-256-identical, lint back to 0. oxlint remains the only gate that sees this file at all
(`packages/core/tsconfig.json` excludes `src/__tests__`). `type-check` **6/6, 0 cached** and `build`
**5/5, 0 cached**, both forced — a replay is not a measurement. `test:scripts` exit **0**, 1018 pass
/ 0 fail across 48 files. `test:plugins` exit **0**, 96 pass / 0 fail across 8 files.

**`check-core-layering` after `git add`: `PASS — 0 violation(s) across 965 tier-to-tier edges in 900
tracked files`.** Read it as **edges 965 unchanged; files 899 → 900** — C36's distinction.

**`test` failed on its first run and the failure is not T3's — attributed by measurement, not by
assertion.** `npx turbo run test --force` exited **1** at **10 of 11** tasks:
`postgres-vector-store.integration.test.ts` red at *"connects to PostgreSQL successfully
[**5001.38 ms**] — a beforeEach/afterEach hook timed out"*. Four readings settle it:

1. `git diff main -- <file>` is **empty** — T3 does not touch it.
2. Standalone against the real developer config: **16 pass / 0 fail, 1.88 s**.
3. Standalone under `XDG_CONFIG_HOME=$(mktemp -d)`: **16 pass / 0 fail, 1.63 s**.
4. The aggregate log shows `Auto-selecting embedding provider…` at `03:17:26.127` reaching
   `[ollama] Provider ready (qwen3-embedding:8b)` at `03:17:32.037` — **5.9 s of cold model load**
   inside a hook budgeted at the global 5 s.

**The decisive reading is the re-run**: with the model warm, `npx turbo run test --force` is
**11/11 tasks, 0 cached, exit 0**, 0 isolation FAILs. So this is the 5001 ms class `CLAUDE.md`
documents — *"passes on a warm model and hangs on a cold one, and CI never sees it"* — in a file
outside PR-D's write set, and **not** a fourth instance to be folded into the two already recorded.
Both readings are kept; quoting only the green one would be the replay problem in another dress.

The new suite is confirmed **inside** the aggregate as
`[test-isolation] PASS: isolated (module mock)`, not only standalone. **Name the metric** for the
isolation figure, because T1's *145* and T2's *367* are not the same measurement: this run is
**180 isolated groups** counted as `[test-isolation] RUN` lines, which is ~361 lines when RUN and
PASS are both counted.

#### What T3 pins that no artifact named

Three properties of the presentation block are characterized here that neither `spec.md`, `design.md`
nor this document states, and each is a real constraint on T12's rewrite:

1. **`:304` and `:318` are mutually exclusive**, being the two arms of one `if/else`, so **three is
   the maximum number of recommendations any response can carry** — never four, which is the number
   the strings suggest.
2. **`compressionRatio` is absent, not zero, on the non-compress branch.** `:303` runs only inside
   `if (shouldAutoCompress)`. A module 7 that initialises the key alongside `tokens` would be a
   wire-shape change invisible to every existing test.
3. **The token math is measured over the *numbered* text `extractLines` emits** (`:637-641`), not
   over the raw file — 920 tokens against 620 for the same 150 lines. An extraction that computes
   tokens before line-numbering changes every figure the caller sees.

### 10.4 T4a — executed, 2026-08-01

One new file, `scripts/check-tools-thin.ts` — **524 lines**, three clauses over a TypeScript AST,
authored against the unmodified tree. **RFS-01 AC-2 and AC-6 close; AC-1's population-print clause
closes.** AC-1's other two conjuncts — *"exits 0"* and *"runs in CI inside the `build` job"* — are
**T15's**, and ~~both task rows~~ → **all three task rows that claim AC-1 — T4a, T14b and T15**
(measured at T4b, §10.5) — already do, so this is a split criterion rather than a defect.
At T4a the gate exits **1**, which is the point of it.

The reading, deterministic across two runs (output byte-identical):

```
[tools-thin] FAIL — 2 of 30 file(s) over the rule; 27 declare an IToolHandler class,
3 do not; 224 members examined; handle() ceiling 120
```

`read_file.ts` **13 maximal / 17 raw / 2 state / handle() 175**; `index_project.ts`
**3 / 3 / 0 / 128**. All 16 body spans reproduce `design.md` §6.5 byte-for-byte. **This is not yet
T5's frozen reading** — T5 takes it after `git add` and transcribes §3.3's table.

#### C39 — the forty-fourth plan defect: two raw figures, two constructor conventions

`design.md` §6.5 states *"an AST walk that descends into nested arrows reports **18** for
`read_file.ts` rather than 13"* and, for `index_project.ts`, **3**. Measured both ways:

| | ctor **exempt** | ctor **counted** |
| --- | --- | --- |
| `read_file.ts` | maximal 13, raw **17** | maximal 13, raw **18** |
| `index_project.ts` | maximal **3**, raw 3 | maximal **4**, raw 4 |

**`18` and `3` is a pair no single convention produces.** §6.5's nine-case table fixes the
convention — *"`true  Constructor  constructor  <- exempt by kind`"* — under which the figures are
17 and 3; §6.5's own prose then quotes 18, which is the other one. The arithmetic tell was visible
in the document and unresolved: 13 + the four named nested arrows (`:423`, `:424`, `:440`,
`:638-641`) is **17, not 18**, and the fifth item is the **constructor entry**, which is not a
nested arrow at all.

**The maximal figures — 13 and 3, the only ones RFS-01 AC-3 records — are identical under both
conventions**, so the frozen base is untouched and no decision moves. The defect is confined to the
raw comparison figure and to a named list that is short by one. Owed to `design.md` (**T20b**,
§8.1 row 8); **not** owed to the parent, because §6.5 is Design's own instrument note with no
criterion behind it. Author level on the C34/C35/C37/C38 precedent. Running total: **forty-four**.

*The rule this earns: when a document prints a metric under two conventions, the tell is its own
subtraction. Both figures had been verified against source; neither had been verified against the
other.*

#### The Plan Challenge gate on T4a — two modes, eighteen findings

Both lenses read-only; `git status --porcelain` checked after each returned rather than trusting the
agents' own reports. Mode selection follows `spec.md` §9.1 and `design.md` §10 — Architecture
(pre-mortem primary, red-team secondary) plus Evidence Audit for the quantitative claims.

**Pre-mortem / red-team — 8 findings. Three changed the file before it was written.**

| # | finding | disposition |
| --- | --- | --- |
| 1 | `/tmp/f1b.ts`, the prototype the plan cites as its own validation, computes **raw** not **maximal** | **CONFIRMED**, and already known to the author before the gate reported it. The shipped gate terminates recursion at a flagged body; the critic independently reproduced 13 with spans byte-identical to §6.5 |
| 2 | **Clause 2 is evaded by moving construction into the constructor body** — `private cache; constructor(){ this.cache = new Map(); }` — and by a literal-wrapped initializer and a type alias | **CONFIRMED, and found independently by the author ~20 minutes earlier.** Closed in code: clause 2 gains a third site (`this.x = new Map()`) and its initializer test scans the **subtree** rather than the top node. Measured **0** hits on the tree, so the base reading cannot move. The type-alias variant needs a type checker, which C32 avoided — named in the docblock instead |
| 3 | `new Function(string)` / `eval` has no AST node to flag | **CONFIRMED.** Docblock, no code — it forfeits type-checking, which is why it is recorded rather than defended against |
| 4 | `ClassStaticBlockDeclaration` matches none of the seven body predicates | **CONFIRMED.** Added to the predicate list; the fixture reads RED |
| 5 | A `private readonly EXTS = new Set([...])` lookup table reads RED though it is a constant, not state | **CONFIRMED, 0 today.** Accepted false positive, named in the docblock — and named *with its consequence*, since clause 2's module-level half flags the same constant hoisted out of the class, so such a table has no legal home in a handler file. That is deliberate, not accidental |
| 6 | Heritage detection is a literal string match; `import { IToolHandler as H }` drops the file out of the population **silently** | **CONFIRMED, 0 today.** Closed in code rather than documented — the gate resolves the local binding name. A population that can shrink without an error is the exact defect this gate replaces |
| 7 | The population print is observational, not self-checking | **ACCEPTED.** Docblock states it is a diffable record, so T25 compares it against the frozen base rather than only checking it is non-zero |
| 8 | R-37's precondition (nothing changes the `tools/` population before T5) holds | **CONFIRMED** independently by the author |

**Evidence audit — 10 claims re-derived with an independent parser. Seven reproduce; three
`high` verdicts were re-measured by the author and all three rejected as stated.**

| claim | verdict |
| --- | --- |
| *"`6 of 30` does not reproduce — broadened three ways, still exactly 4"* | **REJECTED.** `6` is the **union**: 2 body-RED ∪ 4 field-shape = 6, which is what §6.5 says (*"read_file, index_project, **and all four canonical thin handlers**"*). The critic measured the 4 correctly and compared a **subset** count to a **union** count. Measured: union = 6 |
| *"`2 of 30` rests on an unstated scoping assumption; applied file-wide `serialize.ts` has 11 bodies"* | **REJECTED as stated** — C32's rule box and §6.4 item 3 both state the scope. **Substance accepted**: `serialize.ts` is 438 lines with **11** bodies and three `Map`/`Set` constructions and every clause is blind to it. Named in the docblock as the largest blind spot |
| *"`index_project.ts` is 4 maximal bodies, not 3"* | **REJECTED as stated** — 4 is the ctor-counted reading and §6.5's table specifies ctor-exempt. **But it surfaced C39 above**, from the opposite direction to pre-mortem finding 1 |

Two audit results kept as measured: the `handle()` full-span and body-block-only readings are
**numerically identical for all 27** files, because every `handle()` in `tools/` puts its opening
brace on the declaration line — so **the corpus cannot falsify the metric choice**, which is
`design.md` §6.4 item 4's class and is why T4b owes a multi-line-signature fixture. And the ceiling
enumeration 90–130 reproduces exactly.

**Fourteenth time on this feature that a critic's mechanism held while a figure did not** — and the
first time the same underlying defect was reached by both lenses from opposite ends.

#### The gate's discrimination, 18 shapes, before its unit suite exists

Run against the **shipped** `analyzeSource`, not the prototype. **18 ok / 0 wrong.** This is not
T4b — AC-4 and AC-5 are its task and its fixtures are owed a real suite — but a gate is not
quotable until it has failed on purpose, and quoting `2 of 30` required knowing the rule bites.

| shape | expected | got |
| --- | --- | --- |
| canonical thin handler (`private run:` field) | PASS | **PASS** — the 4-vs-6 feasibility cliff avoided |
| helper with no `IToolHandler` class | PASS (n/a) | **PASS** |
| arrows **inside** `handle()` | PASS | **PASS** — not over-strict |
| `handle()` span exactly **120** | PASS | **PASS** |
| **C32 constructor-body closure** | RED | **RED** |
| `this.x = new Map()`, untyped field | RED | **RED** |
| literal-wrapped initializer `[new Map()]` | RED | **RED** |
| module-level `const cache = new Map()` | RED | **RED** |
| private method / getter / `static` / `#private` / arrow property | RED | **RED** (5 shapes) |
| module-level `function work(){}` | RED | **RED** |
| `static {}` block | RED | **RED** |
| generic + multi-line signature — the two shapes that killed the regex detectors | RED | **RED** |
| aliased `IToolHandler` import | RED | **RED**, population preserved |
| `handle()` span **121** | RED | **RED** |

**The ceiling operator is pinned at its exact boundary**, because `>` and `>=` differ at precisely
one value and this feature has already recorded that rule once: spans of 118/119/**120** PASS and
**121**/122 RED. Strict `>`, which is the reading `design.md` §6.2's band derivation used when it
established that `index_project.ts` at exactly 128 is *not* `> 128`.

#### Gates, all six plus the layering gate

`lint` exit **0** — proven to bite rather than assumed: a duplicate-declaration probe appended to
this very file produced ``error: Identifier `dupProbeT4a` has already been declared`` and exit
**1**, restored from a scratch copy SHA-256-identical
(`2c8cc7d6…4b4c` either side), lint back to 0. **oxlint is the only gate that sees this file at
all** — the root `tsconfig.json` has `"include": []`, so `scripts/` is outside every `tsc` project.
`type-check` **6/6, 0 cached** and `build` **5/5, 0 cached**, both forced. `test:scripts` exit
**0**, **1018** pass / 0 fail across 48 files — unchanged, T4a adding no test file. `test:plugins`
exit **0**, **96** pass / 0 fail across 8 files.

**`check-core-layering` after `git add`: `PASS — 0 violation(s) across 965 tier-to-tier edges in
901 tracked files`.** Read as **edges 965 unchanged; files 900 → 901** — C36's distinction applied.
The gate imports only `typescript` and two node builtins, both bare specifiers, so it adds no
tier-to-tier edge; `scripts/` is untiered in any case.

**R-36 verified rather than inherited**: run through `check-coverage.ts`'s own `isMeasuredSource`,
both `scripts/check-tools-thin.ts` and `scripts/__tests__/check-tools-thin.test.ts` return
**`false`**. T4a and T4b carry no coverage-gate incentive pressure.

#### `bun run test` failed twice and the cause was 48 orphaned busy-loops from another project

**Attributed by measurement, and the attribution took seven readings because the first six were
consistent with a defect.** Run 1: exit 1, 9/11 tasks, **3** isolation FAILs, 2m57s. Run 2: exit 1,
10/11, **5** FAILs, 7m33s.

1. The two failing sets are **disjoint** — zero overlap, and a different *package* failed each time
   (`mcp-client`, then `core`). An unchanged tree failing differently twice is non-determinism.
2. All failing files: `git diff main -- <file>` **empty**.
3. `git grep -l check-tools-thin` returns the four `.specs/` planning documents and **the script
   itself — zero code importers**. `bun run test` is turbo over workspace packages and never
   reaches `scripts/`.
4. Standalone, the run-2 files still failed, with `Inserted 100 docs in **22236ms**` in the log.
5. **Postgres round-trip measured at 259 ms per connect+query** — which reproduces that 22.2 s
   arithmetically. The database is 313 MB with 6 connections and no bloat, so it is not DB state.
6. **Host load average 209.31**, 14% free memory, 1.87M pageouts.
7. **56 `zsh` processes, 48 of them orphaned to launchd, in two batches of 24 with identical
   elapsed times.** Their command line is a *deliberate* load simulation from an unrelated project:
   `cd ~/Projects/massa-vault … for i in $(seq 1 24); do (while :; do :; done) & done`. Its
   trailing `kill $HOGS` never reaped them — `jobs -p` in a non-interactive `zsh -c` did not capture
   the backgrounded subshells — so 48 infinite busy-loops were spinning with no parent.

Reaped with the user's explicit approval, matching on `ppid 1` **and** `massa-vault` **and** the
busy-loop text so the 8 real login/tmux shells could not match. Result: zsh **56 → 8**, load
**209 → 68**, Postgres **259 ms → 22.9 ms per round-trip (11×)**.

**Run 3, clean host: `11/11 tasks, 0 cached, 0 isolation FAILs, exit 0, 1m00s`, 180 isolated
groups.** The wall clock is its own corroboration — **7m33s → 1m00s on an identical tree**.

**All three readings are kept.** Quoting only the green one would be the replay problem in another
dress, and the two red ones are the evidence that the green one is a measurement rather than luck.
This is **not** the 5001 ms class `CLAUDE.md` documents and **not** T3's cold-Ollama instance: the
mechanism is host CPU starvation from an external process, the failures are not confined to
LLM-reaching suites, and it does not reproduce once the host is idle. *A gate reading taken on a
loaded host is not a reading — and the load may not be yours.*


### 10.5 T4b — executed, 2026-08-01

**Two files, not one.** `scripts/__tests__/check-tools-thin.test.ts` — **96 cases in 13 describes,
258 assertions**, synthetic fixtures only — and an amendment to `scripts/check-tools-thin.ts`
(**524 → 614 lines**), because AC-5 could not be closed against the gate as T4a shipped it.
**RFS-01 AC-4 and AC-5 both close.** Unit-level, no database, no live LLM: **870 ms** standalone.

#### C40 — the forty-fifth plan defect: AC-5's sixth evasion shape was the one the gate could not see

`spec.md` RFS-01 AC-5 lists *"an object-literal handler that is not a class"* among six evasion
shapes and says in the same sentence that leaving one out *"would be C21's shape (a gate reading
PASS by not looking) aimed forward instead of back."* Measured against the shipped gate:

| fixture | verdict |
| --- | --- |
| `export const tool: IToolHandler = { async handle() { …200 lines… } }` **plus** a module-level `new Map()` | **PASS** |
| the same file with a sibling `function work() {}` | **PASS** |
| every one of AC-5's other five shapes | RED |

`analyzeSource` returns early when no class implements the interface, so **neither clause 1 nor
clause 2 is ever evaluated** — the module-level `Map` is not merely unflagged, it is never collected.
Five of six caught, and the sixth is the only one that needed the population predicate to move.

**This is C33's shape in the task that closes the clause.** T4b's write set was *"1 new test file"*,
so as scoped it could observe the gap and not close it — a clause and the work meant to close it not
acting on the same lines, one artifact down from where C33 found it.

**Resolution — the population is a class that implements the interface *or* an object literal that
claims it. Decided by: the user, 2026-08-01**, from three options with measured consequences; the
rejected two were striking the shape from AC-5 and recording it as a docblock blind spot, and
deferring the widening to a new task before T15. `satisfies` and `as` are unwrapped alongside the
annotation — **measured, both escape an annotation-only predicate**, and AC-5's words cover all three.

**The frozen base is untouched, and that was measured rather than argued.** A patched copy run over
the live tree is **byte-identical** to the shipped gate's: `2 of 30`, 27 declare / 3 do not, 224
members, every body span and state site the same. Only the population *label* moved — `27 declare an
IToolHandler class` → `27 declare an IToolHandler` — because the count is no longer class-only.
T4a's quoted string is stale by that one word and no figure in it is.

#### The widening's own defect, found by the Plan Challenge gate and not by the author's probe

**A false positive, in the code the plan proposed to ship into a merge-blocking gate.** Clause 1
carries an `insideHandle` exemption; clause 2's module-level half never needed one, because a class
method's locals are never module-level statements. An object literal puts `handle()`'s own body
*inside* a `VariableStatement`, so the same unconditional subtree walk flagged a `Map` built and
consumed inside `handle()` — legal for a class, and therefore required to be legal here.

| fixture | first widening | class equivalent |
| --- | --- | --- |
| local `Map` inside `handle()` | **RED** — `state: [{ tool, module, :2 }]` | PASS |

Closed by scanning a handler object's properties **like class fields** and not scanning its
declaration as module state. **The author's own 3-fixture validation could not have caught it**: all
three object-literal probes referenced an *outer* cache and none constructed a local one. *When a
population widens, re-check every clause's exemption against the new scope, not just the membership
predicate — the exemption that was implicit in the narrower scope is the one that disappears.*

#### C41 — the forty-sixth: RFS-01 AC-4's third clause is falsified by C32, and was silently replaced rather than struck

AC-4 requires *"a legal public method added must stay PASS **while still being counted**."*
**Measured: a public method reads RED** (`bodies=1`, `helper [MethodDeclaration]`). AC-4 was written
against `spec.md` §4.1's *"no private method"*; **C32 replaced that predicate with "a declared
function body"**, under which visibility is not consulted at all — `declaresBody()` tests node kind
and nothing else.

**Three documents already disagreed with the clause and none struck it.** `design.md` §6.5 lists
*"a public method"* among the shapes C32's single clause subsumes; `design.md` §6.6 property 4 names
a **different** inert control (`serialize.ts`, a file with no handler) without saying it is replacing
anything; and `tasks.md` T4b's own row lists *"public method"* as a shape it must assert **RED**. So
the row that closes AC-4 contradicted AC-4, and had done since Tasks.

**Resolution: the struck clause is amended in place with its reason, and `serialize.ts`'s shape is
the inert control** — a file declaring no handler, PASS **while still counted**, plus a comment-only
edit that leaves the whole reading unchanged. Author level on the C34/C35/C37/C38/C39 precedent: C32
is a recorded user decision and `design.md` §6.6 property 4 already supplied the replacement, so only
the strike was open. **Handed to T25 as a question**, alongside C37's and AC-2's, because it amends a
criterion rather than a figure. *A criterion superseded in substance by a later decision does not
strike itself, and a document that quietly substitutes a different subject reads as agreement.*

#### Three counts, three documents, and only one of them still said six

AC-5's shape list was extended **in place in `design.md` three times** — §6.4 item 2 (*"Added to
RFS-01 AC-5's fail-shape list"*), §6.4 item 4 (*"joins RFS-01 AC-5"*), §6.5 (*"That fixture is added
to RFS-01 AC-5"*) — while `spec.md` still read *"All six"*, and `tasks.md` T4b enumerated **ten**.
Three live documents, three counts, no amendment anywhere. Corrected in `spec.md` to **thirteen**
declared-body shapes, which is what the suite asserts and counts in an assertion of its own.
*"Added to X's list" written in the document that is not X is a correction with no owner* — PR-C's
**C19** shape for the third time on this feature.

#### `design.md` §6.5's nine-case table is not a `BodyFinding.kind` source, and C39 was the first warning

R-33 requires the nine member-kind classifications asserted directly, so a `typescript` bump fails
`test:scripts` rather than the gate. Transcribing the table would have shipped a wrong assertion:

| shape | §6.5 states | measured (`typescript` 5.9.3) |
| --- | --- | --- |
| `private helper = async () => {…}` | `true  PropertyDeclaration  helper` | flagged node is the nested `ArrowFunction`; `kind: "ArrowFunction"`, `name: "ArrowFunction"` |
| `set thing(v) {…}` | *absent from the table* | `SetAccessor` — a distinct kind the gate handles |

The table is the truth table of `declaresBody()` for the **member** node; `BodyFinding.kind` is the
kind of the node actually **flagged**, and the two diverge for any member whose body lives in a
nested initializer. `PropertyDeclaration` has no `.body` at all. **Second figure in this one table
not to survive being re-run** — C39 was the first, at T4a, on its raw-body count. All nine boolean
verdicts reproduce; only the kind labels do not.

A consequence worth recording for **T5**: an arrow-property body reports `name: "ArrowFunction"`,
losing the member name, because the flagged node has none. The line span still identifies it, which
is what AC-3's per-member baseline needs — pinned in the suite so it is a decision on the record
rather than a surprise when the frozen reading is transcribed.

#### The fixture that missed by one, and why it still passed

The first draft's five ceiling cases were **all off by one and all green** — they asserted the wrong
span and then asserted a verdict consistent with it. `"\n    void 0;".repeat(n)` yields a span of
`n + 2` in the shape the T4a probes used and `n + 3` in the shape this suite's helper uses; the
figure was carried across shapes. **The offset is a property of the fixture, not a constant.**
Fixed by naming the helper for the span it produces, pinning that arithmetic in a test of its own,
and re-asserting the achieved span in every boundary case before its verdict. T3 reached the same
remedy from the other direction (`lineRange.actual.total` pinned per case).

#### The metric choice, falsified off-corpus for the first time

`design.md` §6.4 item 4's class, for clause 3's metric. T4a measured that the `handle()` **full-span**
and **body-block-only** readings are numerically identical across all 27 live files, because every
`handle()` in `tools/` opens its brace on the declaration line — *"not evidence the metric is robust;
evidence the corpus cannot test it."* The fixture the corpus could not supply:

| fixture | full span | body block | gate | a body-block reimplementation |
| --- | --- | --- | --- | --- |
| single-line signature, 120 | 120 | 120 | PASS | PASS — **delta 0**, today's corpus reproduced |
| 5-line generic signature | 121 | 116 | **RED** | **PASS** |

The discriminating window is full-span **121–124**; outside it both metrics agree, so the fixture is
sized for the window deliberately. `design.md` §6.2's band `[113, 128)` was derived under the
full-span reading, and this is the only place in the repository where that choice is observable.

The same applies to the brace-in-a-string fixtures, and **the form `design.md` names is the narrow
one**: a `{` inside `handle()` makes a naive counter overshoot by one, so it discriminates at
**exactly one span** (AST 120 PASS / naive 121 RED). A `}` makes the counter close two lines in and
report **2**, so it discriminates across the whole range above the ceiling (AST 121 RED / naive 2
PASS). Both ship. Sized anywhere else the named one is inert — the mutation-resolves-to-nothing class
recorded at T3, now in a fixture rather than a mutation.

#### The suite's discrimination, and what the live tree cannot see

Backed up to a scratch copy with SHA-256 byte-identity asserted on restore, refuse-on-anchor-not-found
and refuse-on-byte-identical on every patch, **never `git checkout`**. Harness
`~/prd-exec-instruments/t4b-mutations.ts`.

**The second column is different from T2's and T3's, because the subject is the gate.** No population
of existing suites could guard `check-tools-thin.ts` — nothing else imports it. The premise worth
measuring instead is the one T4a's reading rests on: **can the live-tree run see these mutations?**

| # | mutation | expected | suite | live-tree run |
| --- | --- | --- | --- | --- |
| R1 | `HANDLE_MAX_LINES` 120 → 130 | FAIL | **FAIL** 89p/7f | moved — ceiling only; still `2 of 30` |
| R2 | clause 3 operator `>` → `>=` | FAIL | **FAIL** 93p/3f | **blind** |
| R3 | `declaresBody` drops `GetAccessor` | FAIL | **FAIL** 93p/3f | **blind** |
| R4 | `declaresBody` drops `SetAccessor` | FAIL | **FAIL** 93p/3f | **blind** |
| R5 | `declaresBody` drops `ClassStaticBlockDeclaration` | FAIL | **FAIL** 93p/3f | **blind** |
| R6 | `constructsState` stops descending | FAIL | **FAIL** 94p/2f | **blind** |
| R7 | clause 2 loses its `this.x = new Map()` site | FAIL | **FAIL** 95p/1f | **blind** |
| R8 | interface resolution reverts to a literal match | FAIL | **FAIL** 95p/1f | **blind** |
| R9 | **C40 reverted** — object literals leave the population | FAIL | **FAIL** 88p/8f | **blind** |
| R10 | **C40's `handle()` exemption dropped from clause 2** | FAIL | **FAIL** 94p/2f | **blind** |
| R11 | `walk` descends unconditionally — maximal becomes raw | FAIL | **FAIL** 94p/2f | moved — 18 → 22 span lines; still `2 of 30` |
| R12 | the population print loses its member count | FAIL | **FAIL** 94p/2f | moved — the print itself |
| R13 | comment-only edit (**inert control**) | PASS | **PASS** 96p/0f | **blind** |

**Every row landed as expected**, 1/1 file byte-identical afterwards, and the control's assertion
count reproduced exactly (258) either side.

**Ten of thirteen mutations are invisible to the live-tree run, and the `2 of 30` verdict does not
move under a single one of them** — not even the three whose output changes. So *"the gate still
reads `2 of 30`"* is not evidence the rule is intact; it is evidence about two files. **AC-4's
requirement that a sensor fail on purpose was the only thing that could establish this, and it had
never been measured** — T4a's 18 shapes ran against the analyzer and could not speak to the gate's
own exports, its `git ls-files` path, or its report.

#### Gates, all six plus the layering gate

`lint` exit **0** — proven to bite rather than assumed: a duplicate-declaration probe appended to the
new suite produced ``error: Identifier `dupProbeT4b` has already been declared`` and exit **1**,
restored SHA-256-identical (`50db7877…`), lint back to 0. oxlint prints the single line `$ oxlint` on
success, which is indistinguishable from a gate that did not run, and it remains **the only gate that
sees either file** — the root `tsconfig.json` has `"include": []`, so `scripts/` is outside every
`tsc` project. `type-check` **6/6, 0 cached** and `build` **5/5, 0 cached**, both forced.
`test` **11/11 tasks, 0 cached, 0 isolation FAILs, exit 0, 1m01s**, 180 isolated groups, on a host at
load **2.6**. `test:scripts` exit **0**, **1114** pass / 0 fail across **49** files — 1018 / 48 at
T4a, so T4b adds one file and 96 tests. `test:plugins` exit **0**, **96** pass / 0 fail across 8.

**`check-core-layering` after `git add`: `PASS — 0 violation(s) across 965 tier-to-tier edges in 902
tracked files`.** Read as **edges 965 unchanged; files 901 → 902** — C36's distinction. T4b adds one
tracked code file; the gate script was already tracked, and the widening imports nothing new.

**R-36 re-verified rather than inherited**, the test file now existing where at T4a it did not: run
through `check-coverage.ts`'s own `isMeasuredSource`, both `scripts/check-tools-thin.ts` and
`scripts/__tests__/check-tools-thin.test.ts` return **`false`**. Neither carries coverage-gate
pressure.

#### The Plan Challenge gate on T4b — two modes, sixteen findings

Both lenses read-only; `git status --porcelain` **and** the gate's SHA-256 checked after each returned
rather than trusting the agents' own reports — `2c8cc7d6…4b4c`, matching T4a's recorded value.
Mode selection reuses this feature's recorded route (`spec.md` §9.1, `design.md` §10): Architecture
pre-mortem/red-team, plus Evidence Audit for the quantitative claims.

**Pre-mortem / red-team — 5 findings. One changed code the plan had already validated.**

| # | finding | disposition |
| --- | --- | --- |
| 1 | the widening false-positives a **local** `Map` inside an object-literal `handle()` | **CONFIRMED and it is the finding of this task.** Reproduced against the author's own prototype; the author's three object-literal probes all referenced an outer cache and could not have caught it. Closed in code before authorship |
| 2 | the AC-5 object-literal gap needs a defect number, not a write-set note | **ACCEPTED** — C40 |
| 3 | the AC-4/C32 contradiction needs a number tying the strike to its cause | **ACCEPTED** — C41 |
| 4 | §6.5's nine-case table is not a safe literal source for `kind` | **CONFIRMED**, and the same finding arrived independently from the evidence audit |
| 5 | exact-line-count fixtures have no construction discipline and the natural idiom misses by one | **CONFIRMED** — measured `repeat(118)` → span 120, and the first draft was off by one on all five |

It also flagged, without measuring, that `satisfies IToolHandler` would escape an annotation-only
predicate. **Measured: it does, and so does `as`.** Both are now unwrapped. *A critic's unmeasured
aside is still a lead — the two shapes it named were the two the author had not thought to probe.*

**Evidence audit — 19 claims re-derived with independent parsers. Six do not reproduce.** All six
re-measured by the author and **all six confirmed**, which is the first pass on this feature where
no audit finding was rejected. A1–A5 (the live reading, both per-file member counts, the ceiling
operator, the 13-name export surface) all reproduce exactly.

| # | figure | stated | measured |
| --- | --- | --- | --- |
| 1 | AC-4's public-method control | PASS | **RED** — C41 |
| 2 | `design.md` §6.6 property 4 vs AC-4 | the same control | **two different subjects**, and only the `design.md` one behaves as claimed |
| 3 | task rows claiming RFS-01 AC-1 | *"both task rows"* (§10.4) | **three** — T4a, T14b, T15. Corrected in §10.4 in place |
| 4 | §6.5 nine-case table row 2 | `PropertyDeclaration` | **`ArrowFunction`** |
| 5 | task rows / distinct files | 28 / 78 | **29 / 80** — T8b had no §5 row |
| 6 | AC-5's shape count | 6 | **three documents, three counts** |

**§5's row count is 28 and always was** — the enumeration is scripted in this record's own method,
and the handoff figure that said §5 gives 29 does not reproduce. The 29 is the *distinct task* total
**including** T8b, which is exactly the point: T8b was real, owned, and absent from the table a
reader enumerates from. Its row now exists, and §1's write-set table carries its two files.

**Fifteenth time on this feature that a critic's mechanism held while a figure did not** — this time
the author's, twice: the carried-across fixture offset, and three object-literal probes that shared
a blind spot. Running total: **forty-six** plan defects.

#### What T4b pins that no artifact named

1. **The `2 of 30` verdict is invariant under twelve real mutations of the rule.** A per-file count
   is not a per-clause check, which is R-40's concern reaching one level further than R-40 states.
2. **An arrow-property body loses its member name in the report**, so T5's per-member baseline will
   record `ArrowFunction` with a span for at least one of `read_file.ts`'s 13.
3. **The `handle()` metric is only falsifiable in a 4-line window** (full span 121–124) and nowhere
   else, so a single badly-sized fixture would have left the choice unpinned exactly as the corpus
   does.

### 10.6 T5 — executed, 2026-08-01

**RFS-01 AC-3 closes.** One file, this one. **Not a test** (§3.5 item 4, `design.md` §6.6
property 5) — the reading is a record; the gate's suite is T4b's.

**The precondition is R-37, not the mechanism `design.md` §6.6 property 1 gives**, which §3.5 item 4
already struck. Measured: `git diff main..HEAD -- packages/core/src/tools/` is **empty**, `git log`
over the same path across the branch has **0** entries, and the directory holds **30** tracked files,
all `.ts`. Staged anyway — the reading after `git add` is byte-identical to the reading before it,
which is what §3.5 item 4 predicted and is recorded so the habit stays a habit rather than becoming
a belief.

#### The frozen base reading

```
VIOLATION  index_project.ts
    body     :39-44 (6 lines)  canonicalizeProjectRoot  [FunctionDeclaration]
    body     :46-68 (23 lines)  assertProjectRootReuse  [FunctionDeclaration]
    body     :254-351 (98 lines)  executeIndexing  [MethodDeclaration]
    handle() 128 lines  (ceiling 120)
    -- maximal bodies 3, raw 3, state 0, handle() 128
VIOLATION  read_file.ts
    body     :33-36 (4 lines)  ArrowFunction  [ArrowFunction]
    body     :167-171 (5 lines)  ArrowFunction  [ArrowFunction]
    body     :368-385 (18 lines)  resolveFilePath  [MethodDeclaration]
    body     :407-448 (42 lines)  checkPathContainment  [MethodDeclaration]
    body     :450-470 (21 lines)  getProjectRoot  [MethodDeclaration]
    body     :477-483 (7 lines)  evictOldest  [MethodDeclaration]
    body     :485-507 (23 lines)  calculateRange  [MethodDeclaration]
    body     :509-516 (8 lines)  adjustRange  [MethodDeclaration]
    body     :518-580 (63 lines)  readFileWithCache  [MethodDeclaration]
    body     :582-628 (47 lines)  extractMetadata  [MethodDeclaration]
    body     :630-643 (14 lines)  extractLines  [MethodDeclaration]
    body     :645-681 (37 lines)  detectLanguage  [MethodDeclaration]
    body     :683-706 (24 lines)  extractImports  [MethodDeclaration]
    state    :145  fileCache  [field]
    state    :146  projectRootCache  [field]
    handle() 175 lines  (ceiling 120)
    -- maximal bodies 13, raw 17, state 2, handle() 175

[tools-thin] FAIL — 2 of 30 file(s) over the rule; 27 declare an IToolHandler, 3 do not; 224 members examined; handle() ceiling 120
```

Exit **1** — the intended Phase 1 state; AC-1's *"exits 0"* is T15's. **Spans are
declaration-only** (C43 below). The population line carries no *"class"*, C40's label change,
which is the one word by which T4a's quoted string is stale.

#### `read_file.ts` — per member

**Two of the thirteen are not class members**, so *"per member"* decomposes as **11 methods + 2
anonymous arrows** — and the 11 is exactly C29's corrected private-method count (13 → 11).

| # | span | lines | name | kind |
| --- | --- | --- | --- | --- |
| 1 | `:33-36` | 4 | **`ArrowFunction`** — the **module-level** IIFE initializing `MASSA_AI_READ_FILE_MAX_LINES` | `ArrowFunction` |
| 2 | `:167-171` | 5 | **`ArrowFunction`** — the `eventBus.subscribe("indexing:started", …)` callback, **inside the constructor body** | `ArrowFunction` |
| 3 | `:368-385` | 18 | `resolveFilePath` | `MethodDeclaration` |
| 4 | `:407-448` | 42 | `checkPathContainment` | `MethodDeclaration` |
| 5 | `:450-470` | 21 | `getProjectRoot` | `MethodDeclaration` |
| 6 | `:477-483` | 7 | `evictOldest` | `MethodDeclaration` |
| 7 | `:485-507` | 23 | `calculateRange` | `MethodDeclaration` |
| 8 | `:509-516` | 8 | `adjustRange` | `MethodDeclaration` |
| 9 | `:518-580` | 63 | `readFileWithCache` | `MethodDeclaration` |
| 10 | `:582-628` | 47 | `extractMetadata` | `MethodDeclaration` |
| 11 | `:630-643` | 14 | `extractLines` | `MethodDeclaration` |
| 12 | `:645-681` | 37 | `detectLanguage` | `MethodDeclaration` |
| 13 | `:683-706` | 24 | `extractImports` | `MethodDeclaration` |

**State**: `:145` `fileCache` `[field]`, `:146` `projectRootCache` `[field]` — both `[field]`, so
the live tree exercises **one** of clause 2's three sites; the `module` and `assignment` sites are
**0** and prospective, as T4a measured. **`handle()` `:174-348` = 175**, re-derived independently
and matching the gate. **maximal 13 / raw 17** — the 4 nested arrows are `:423`, `:424`, `:440`
inside `checkPathContainment` and one at `:638-641` inside `extractLines`.

**The two anonymous bodies are the pin `HANDOFF.md` predicted and it predicted them short.** It said
*"at least one of `read_file.ts`'s 13 will read `ArrowFunction`"*; measured, **two** do. The flagged
node for a nested initializer has no name of its own, so **the span is the only identifier** — which
is what AC-3's per-member baseline needs and why T4b pinned the behaviour in the suite rather than
leaving it to be discovered here.

#### `index_project.ts` — per member

| # | span | lines | name | kind |
| --- | --- | --- | --- | --- |
| 1 | `:39-44` | 6 | `canonicalizeProjectRoot` | `FunctionDeclaration` |
| 2 | `:46-68` | 23 | `assertProjectRootReuse` | `FunctionDeclaration` |
| 3 | `:254-351` | 98 | `executeIndexing` | `MethodDeclaration` |

**State**: none. **`handle()` `:117-244` = 128**, re-derived independently and matching the gate and
§3.6. **maximal 3 / raw 3.** Two of the three are `FunctionDeclaration` at **module level**, which
is C32's file scope doing the work `spec.md` §4.2's *"1 body"* did not see.

#### The rest of the population

| group | files | maximal bodies | state | `handle()` |
| --- | --- | --- | --- | --- |
| the other 25 handlers | 25 | **0** (max) | **0** (max) | **≤ 113**, max `impact_analysis.ts` at 113 |
| declare no `IToolHandler` | 3 — `index.ts`, `serialize-interfaces.ts`, `serialize.ts` | n/a | n/a | n/a |

Verified independently rather than read off the summary: all **27** handlers have `handleLines > 0`;
the 3 non-handlers declare no `handle(` **and do not name `IToolHandler` at all**; **0** files import
it under an alias; the per-file `membersExamined` sum to **224**. Every §3.3 figure reproduces.

#### C42 — the forty-seventh plan defect: `2 of 30` is a union, and clause 2's own reading is `1`

§3.3 and `design.md` §6.6 property 2 both state *"`2 of 30` on the body/`Map` clauses and `2 of 27`
on the `handle()` clause, the same two files."* Derived per clause from the gate's own `--json`:

| clause | RED | files |
| --- | --- | --- |
| 1 — a declared body outside `handle()` | **2 of 30** | `index_project.ts`, `read_file.ts` |
| 2 — `Map`/`Set` state | **1 of 30** | `read_file.ts` **only** |
| 3 — `handle()` > 120 | **2 of 27** | `index_project.ts`, `read_file.ts` |

`index_project.ts` has **0** state sites, so the stated `2 of 30` is the **union of clauses 1 and 2**
and neither clause's own reading. **The same union-vs-subset confusion the T4a evidence audit hit
from the opposite end** — there a critic compared a subset count to the `6 of 30` union and was
rejected; here the document does it to itself, and is right.

**What it changes is R-39's scope, not a verdict.** R-39 names clause 3 as the clause whose value is
prospective because it *"flags no file the other two miss"*. Measured, **clause 2's RED set is a
strict subset of clause 1's and clause 3's**, so the same sentence is true of it and no artifact says
so. Author level on the C34/C35/C37/C38/C39/C41 precedent — AC-3's own text records `2 of 30` and is
untouched, and the replacement reading is named. Owed to `design.md` (**T20b**, §8.1 row 13); **not**
owed to the parent, because §6.6 is Design's own property list with no criterion behind it.

#### C43 — the forty-eighth: the span anchor is split per file, unstated, and it orphans two comments

RFS-01 AC-3's base is a member-level **span** claim, so the anchor is load-bearing. Every span
citation in the artifacts that points into either file — **26**, not the 14 the flagged members
supply — checked against source:

| citation | count | reading |
| --- | --- | --- |
| no preceding comment — the two conventions coincide | **16** | indistinguishable |
| cited **comment-inclusive** | **8** | all in `read_file.ts` |
| cited **declaration/statement-only, orphaning a comment** | **2** | both in `index_project.ts` |

**The mix is per file, not per citation.** `read_file.ts`'s spans are comment-inclusive at all 8
sites where a comment exists and orphan **none**; `index_project.ts`'s orphan at both sites where one
exists and are comment-inclusive at **none**. The gate's own convention is uniformly
declaration-only. Third instance on this feature of *the corpus cannot falsify the convention*
(T4a's `handle()` full-span vs body-block, T4b's brace fixture) and the second of the **mixed
unstated anchor** class (§8 pre-mortem finding 3, the LRU sites) — this time split cleanly by file,
which is the mechanism: the two files' spans were measured in different passes.

**The two orphans are both Phase 4, and one of them is gate-relevant.**

| row | cited | orphaned comment | consequence |
| --- | --- | --- | --- |
| **T13** | `:254-351` | `:246-253`, 8 lines | outside `handle()`; a doc block left describing code that moved. **C33's conclusion does not move** — the span is outside `:117-244` under either convention |
| **T14b** | `:158-202` | `:151-157`, 7 lines (`// ── Wave 5 FR-09: …`) | **inside `handle()` `:117-244`**, and the gate measures that span **including comment lines**. Leaving it puts the planned `128 → ~87` at **~94**, spending 7 of the 33 lines of margin the row prices |

**No artifact mentions either comment.** `design.md` §5.1 module 8's own **~110** LOC estimate is the
arithmetic tell, C39's shape a second time in the same table: comment-inclusive is **106**,
declaration-only **98**. Both rows amended in §5 with their reason. Author level — the replacement
spans are named, C33's decision is untouched, and moving a comment with the code it describes is the
only reading any document supports. Owed to `design.md` (**T20b**, §8.1 row 14).

**This finding was found twice and got its figures wrong both times before it was right**, which is
worth more than the finding. The first sweep was scoped to **declared members**, the population
`ts.getLeadingCommentRanges` reaches from a declaration node — so it saw `executeIndexing` and was
structurally blind to T14b's `:158-202`, a plain statement range inside `handle()` that is not a
member at all. *An anchor audit is only as complete as its definition of the thing anchored, and the
task rows cite code ranges, not declarations.*

#### What the frozen record can and cannot witness

**Amended at T7 by C50 (§10.8): the two per-member tables above are frozen in their *counts* and
as-of-T5 in their *line spans*.** T7's delegate moves **15 of 15** of `read_file.ts`'s entries (13
bodies + 2 state sites) while every count holds, and moves **0 of 3** in `index_project.ts`. The
spans below are therefore a record of the tree at `9adee57`, not a prediction about the tree at T9 —
diff the counts, and expect the spans to have shifted by the stated delta.

The premise T5 rests on, measured rather than inherited. Instruments: seven copies of the shipped
gate with **only `isViolation`'s body patched**, plus a comment-only inert control — refuse-on-anchor-
not-found and refuse-on-byte-identical on every patch, and **the baseline copy's output is
byte-identical to the shipped gate's**, which is what makes the diffs readable. No repo file was
mutated, so no restore was needed and `git checkout` was never a temptation.

| variant | verdict line | full report | lines differing |
| --- | --- | --- | --- |
| comment-only (**inert control**) | same | identical | 0 |
| clause 1 deleted | same | **identical** | 0 |
| clause 2 deleted | same | **identical** | 0 |
| clause 3 deleted | same | **identical** | 0 |
| clause 1 only | same | identical | 0 |
| clause 2 only | **`1 of 30`** | MOVED | 8 |
| clause 3 only | same | identical | 0 |

**Any one of the three clauses can be deleted outright and the entire report — verdict, every span,
every state site, the population line — is byte-identical.** The mechanism is exact rather than
statistical: `report()` prints every body, state site and `handle()` overage of every *violating*
file regardless of which clause made it violate, and on a 2-file population each file is held in by
more than one clause.

**This does not falsify §3.3's reason for recording per member, and the first draft of this section
said it did.** That reason is that the AST enumerates members and spans correctly where three regex
detectors did not — which the independent re-derivation above confirms it does. What the table
establishes is a **different and adjacent** limitation: the frozen base witnesses **the tree** — 16
spans, 2 state sites, 2 `handle()` lengths, exactly what Phases 3 and 4 must move — and **does not
witness the rule**, which is AC-4's job and T4b's. Two complementary sensors, neither substituting
for the other. C42 and this table are two views of one measured fact and are recorded as such.

**It extends T4b's result by one level rather than repeating it.** T4b mutated clause *internals* and
found 10 of 13 invisible to the live-tree run; this deletes whole clauses and finds **3 of 3**
invisible in the full report. R-40's mitigation already requires T25 to re-run the gate *per clause*;
what this adds is the method and one fact that method needs — **the per-clause reading is not
derivable from the default report at all.** It needs `--json` or a patched gate, because the report
is organised by file and not by clause.

#### Gates

**T5's write set is `.specs/`-only and no gate's subject moves — measured, not asserted**, because
the plan asserted it first and one of the checks came back the other way before it came back this
way. `check-tools-thin`'s `TOOLS_DIR` filter and `check-core-layering`'s `CODE` regex both exclude
`.md`; `lint` is oxlint over code; `type-check` / `build` / `test` are turbo over workspace packages
and `.specs/` is not one; `test:plugins` reads `apps/*-plugin/__tests__` only.

The one that needed measuring rather than reasoning: **`scripts/check-stale-pointers.ts` scans
tracked files repo-wide and `test:scripts` runs it.** `.specs/` is the **second entry in its
`EXCLUDED` list** — *"the plan's own record of what moved where"* — so it cannot see this file.
Baseline confirmed anyway: `PASS — 0 broken, historical exactly at its pin of 28`, exit **0**. Of the
15 suites under `scripts/__tests__` that name `.specs/`, **13 name it only in prose**; the 3 that
read files read `core-layering-god-module-split`'s frozen fixtures or assert `STATE.md` **exists**.
None reads this feature's directory.

`check-tools-thin` re-run **after `git add`**: byte-identical to the reading above, exit 1.
`test:scripts` re-run as the empirical backstop for the paragraph above — exit **0**, **1114** pass /
0 fail across **49** files plus 8 shell scenarios, which is T4b's figure unchanged, as it must be for
a commit that adds no test file. The summary was read from the log rather than inferred from the exit
code: `bun test` writes it to **stderr** on success as well as failure, so *"no match → pass"* is a
default this record refuses.

**The transcription itself is verified, not proofread.** The gate output above is **byte-identical**
to the live run — asserted by a script that parses the fenced block back out of this file and
diffs it — and both per-member tables were parsed back out and checked **cell by cell** against the
gate's own `--json`: **72 assertions, 0 mismatches**. That check is here because the failure this
feature has repeated most is a document asserting something its own instrument did not say, and a
frozen baseline is the artifact where that failure is least visible and most expensive. *Its first
run reported `row count 0`, which was the parser and not the table — a sensor's red is a claim about
the sensor until you have checked which.*

**Precedent checked rather than assumed**: the four prior pure-`.specs/` commits on this branch
(`7f2dc49`, `a68ce72`, `d604d31`, `35f9895`) recorded no gate battery; the full six ran on the
commits that added tracked code (T1–T3, `180f7d2`, `e0ebf17`). T5 is in the first class.

#### The Plan Challenge gate on T5 — two modes, six findings

Both lenses read-only; `git status --porcelain` **and** the SHA-256 of all ten files they were
pointed at were checked after each returned rather than trusting the agents' own reports — all ten
`OK`, tree unchanged. Mode selection reuses this feature's recorded route (`spec.md` §9.1,
`design.md` §10).

**Both modes independently found the same defect, and it was the author's own carried figure.**
*"§5.1's ~110 matches the comment-inclusive count **108**"* → measured **106** (`:246-351`). The 108
came from an earlier instrument anchored at `:244` — which is **`handle()`'s own closing brace**, one
line into the previous member — and that instrument's control had **already failed once** and been
rewritten. The corrected figure was carried forward from the run that produced it rather than
re-derived. *This is §10.5's fixture lesson verbatim, in the section auditing another document for
exactly this class.* **Sixteenth time on this feature that a critic's mechanism held while a figure
did not — and the seventeenth is in the same paragraph**: the red-team located T14b's orphaned
comment at `:150-156`; measured, it is **`:151-157`**, `:150` being the blank line.

| # | mode | finding | disposition |
| --- | --- | --- | --- |
| 1 | red-team | T14b's `:158-202` orphans a 7-line comment, and the author's sweep was structurally blind to it | **CONFIRMED and it is the finding of this task.** The sweep's population was declared members; task rows cite code ranges. Re-run over all **26** cited spans |
| 2 | both | the `108` comment-inclusive figure | **CONFIRMED — 106.** Corrected before authorship |
| 3 | red-team | Finding B's framing over-reads §3.3's stated rationale | **CONFIRMED.** The per-member rationale is about the AST enumerating correctly, which holds; the redundancy limitation is adjacent, not a falsification. Reframed above |
| 4 | red-team | C42 and the clause-deletion table are two views of one fact | **ACCEPTED** — recorded as such rather than as two discoveries |
| 5 | evidence audit | the 8-line diff is correct only when scoped to the tool's own stdout | **ACCEPTED** — it was; recorded for T25, which re-runs this instrument |
| 6 | evidence audit | ~60 figures re-derived with an independent AST analyzer; every other one reproduces | **CONFIRMED**, including the per-clause table, all seven variants, the 16-row anchor classification, the population, R-37, and the two stale header clauses |

Running total: **forty-eight** plan defects.

#### What T5 pins that no artifact named

1. **The frozen base is a claim about the tree, not about the rule.** Byte-invariant under deleting
   any one of the three clauses. Pair it with AC-4's suite or it certifies less than it appears to.
2. **Clause 2 is exercised by one file and one of its three sites.** `read_file.ts`, both `[field]`;
   `module` and `assignment` are 0 and prospective. After Phase 3 clause 2 reads `0 of 30` having
   never been about `index_project.ts` at all.
3. **Two of `read_file.ts`'s thirteen bodies have no name in the report**, so the span is their only
   identifier — and neither is a class member: one is module-level, one is inside the constructor.
4. **The span anchor splits by file**, and the split is invisible at 16 of 26 citations.

### 10.7 T6 — executed, 2026-08-01

**RFS-02 AC-2 closes in part and AC-3 closes.** Two new files, `packages/core/src/services/cache/lru-evict.ts`
(one exported function, imports nothing) and `packages/core/src/__tests__/lru-evict.test.ts`
(15 cases, 43 assertions). **Phase 2, and the first task on this branch that moves code.**

Neither `services/cache/index.ts` nor `services/index.ts` is touched, so the extraction adds **0**
names to `@massa-ai/core`'s published surface — `design.md` §5.1's stated principle for
`services/file-read/`, applied to the one module that lands outside it. Verified rather than
assumed: `services/index.ts:69` re-exports `L1MemoryCache` from `./cache/l1-memory-cache.js`
**directly**, so `services/cache/index.ts` is not on the path to the published surface at all, and
`services/embeddings/` already imports two `services/cache/` members by bypassing that same barrel.

#### C44 — the forty-ninth plan defect: `(cache, cap)` is underdetermined, and both obvious readings are behavior-changing

`design.md` §5.1 module 1 specifies the shared module as *"a function taking `(cache, cap)`"*. That
phrasing does not determine the predicate, because **the five caches do not share one**:

| site | position | predicate |
| --- | --- | --- |
| `read_file.ts` · `fileCache` | pre-insert | `while (size >= 512)` |
| `read_file.ts` · `projectRootCache` | pre-insert | `while (size >= 512)` |
| `symbol-graph.service.ts` | pre-insert | `while (size >= 512)` |
| `web-controller.ts` | post-insert | `while (size > 512)` |
| `file-filter-cache.ts` | post-insert | `if (size > 50)`, evict-one |

`spec.md` §3.B establishes that pre-insert `>=` and post-insert `>` **retain the same number**. True,
and it is the premise the whole unification rests on — but it holds only while each site keeps
**both** its operator and its call position. Collapse them onto one operator with every site passing
its own literal cap and the retained count moves, in **opposite directions** depending on which
operator wins. Measured: three candidates, each a **full prospective T7 repoint of all five caches**,
with T1's characterization suite as the oracle (baseline **5 pass / 0 fail / 3115 expect()**):

| candidate | shared predicate | what each site passes | verdict | failing cases |
| --- | --- | --- | --- | --- |
| **A** *(adopted)* | `while (size > maxRetained)` | pre-insert `CAP - 1`, post-insert `CAP` | **PASS 5p/0f/3115x** — identical to baseline | — |
| B | `while (size > cap)` | its own literal `CAP` | **FAIL 3p/2f/3111x** | `read_file · projectRootCache`, `symbol-graph` |
| C | `while (size >= cap)` | its own literal `CAP` | **FAIL 3p/2f/3105x** | `web-controller`, `file-filter-cache` |

**Resolution: the second parameter is a post-call bound, not "the cap".** The contract is
`cache.size <= maxRetained` on return; pre-insert callers pass `CAP - 1` to reserve the slot the
pending insert takes. This is not a compromise between the two readings — it is **exact**, because
`size > cap - 1` and `size >= cap` are the same predicate over integers. That algebraic form was
supplied by the evidence-audit lens and is **stronger than the empirical result it was auditing**:
candidate A is a pure reformulation of every site, not a configuration that happened to pass a suite.

Author level on the C34/C35/C37/C38/C39/C41/C42/C43 precedent — RFS-02 AC-1's byte-identity
requirement and AC-2's *"no site's TTL or read-promotion policy moves"* jointly fix the answer, and
the replacement is named and measured. Owed to `design.md` (**T20b**, §8.1 row 15); **not** owed to
the parent, because §5.1's module table is Design's own decomposition with no criterion behind it.

#### C45 — the fiftieth: T1's `fileCache` characterization case does not discriminate eviction

Found by pulling on candidate B's result rather than by inspection. B disables correct eviction at
all **three** pre-insert sites and only **two** cases went red. Measured directly — neuter
`read_file.ts`'s `evictOldest` body entirely, which reaches **both** of that file's caches through
the one private method:

| case | unmutated | `read_file.evictOldest` neutered |
| --- | --- | --- |
| `read_file · fileCache` | 1p/0f | **1p/0f — unchanged** |
| `read_file · projectRootCache` | 1p/0f | **0p/1f** |
| `symbol-graph · projectRootCache` | 1p/0f | 1p/0f (its own separate method, untouched) |

**The mechanism is exact.** The case offers `read("fc-1")` returning `"V2"` as its evidence that
`fc-1` was evicted and re-read from disk. But `fc-1` was **inserted during the fill loop at `:156-158`,
after the disk was rewritten to V2 at `:152`**, so its *cached* value is `"V2"` too. A cache hit and
a fresh re-read are byte-identical, and the assertion cannot tell them apart. The only genuinely
discriminating assertion left in that case is `fc-0` still replaying `"V1"`, which tests
read-promotion survival and passes trivially when nothing is evicted at all.

**§10.1's own mutation table already contained this reading and nobody read it that way.** M8
(*"`read_file` `evictOldest` neutered"*) is recorded as **FAIL 4p/1f** — one failure, from a mutation
that reaches two of the five characterized caches. The figure is correct; what was missing is that a
1-of-2 kill on a 2-site mutation is a statement about the site that survived. *A mutation table's
own arithmetic is evidence, and a row can be right while the count inside it goes unread.*

**Consequence, and it is narrower than it first looks.** The pre-existing
`read-file.test.ts:264-299` **does** characterize `fileCache` eviction non-vacuously — it asserts
`fileCache.has("key-1")` is `false` against the private Map directly. So the site is covered today.
What C45 establishes is that **RFS-02 AC-1's own suite is not what covers it**, which matters because
that is the suite T7 must leave byte-identical and green, and because `read-file.test.ts` loses its
subject at Phase 3. Owed back to §10.1's record; **not** a new task — T6's own suite carries the
retained-count and victim-identity assertions directly on the function, where they survive Phases 3
and 4.

#### C46 — the fifty-first: T7's shape is unfixed, and it decides whether AC-3's frozen base moves during Phase 2

**Found by the red-team lens, whose mechanism held and whose conclusion did not.** The finding was
that T7 repoints `evictOldest` off `ReadFileTool`, so `read-file.test.ts:264-299` — which reaches
`fileCache`, `projectRootCache`, `evictOldest` and `FILE_CACHE_MAX_ENTRIES` through a cast — throws,
`bun run test` is red at T7's commit, and T8 must therefore be folded into T7. `tasks.md` T8's row
asserts the same thing in the plan's own words: the test *"cannot survive T7 unmodified."*

**Both are claims about a T7 shape that no artifact fixes.** Two are available, and only one had been
considered. Measured:

| T7 shape | `lru-eviction-characterization` | `read-file.test.ts` | `check-tools-thin` — `read_file.ts` | members examined |
| --- | --- | --- | --- | --- |
| *(baseline, unpatched)* | 5p/0f/3115x | **7p/0f/34x** | maximal **13**, raw 17, state 2, `handle()` 175 | **224** |
| **delegate** — keep `private evictOldest<K,V>(cache)` as a one-line call into the module | 5p/0f/3115x | **7p/0f/34x** | **13 / 17 / 2 / 175 — byte-identical** | **224** |
| **inline** — delete the method, call the module at `:169`, `:462`, `:570` | 5p/0f/3115x | **6p/1f/28x** | maximal **12**, raw **16**, state 2, `handle()` 175 | **223** |

**The red-team's mechanism is confirmed and its conclusion is rejected as stated**: the red commit
is a property of the inline shape, not of T7. **Eighteenth time on this feature that a critic's
mechanism held while its figure or conclusion did not.**

**What the measurement adds is sharper than the finding, and it is the reason this is C-numbered.**
The inline shape **moves RFS-01 AC-3's frozen base during Phase 2**. `tasks.md` §3.1 argues it cannot:
*"Phases 1 and 2 move no `tools/` file — Phase 2 edits `read_file.ts` but adds and removes none, so
the population the reading describes is unchanged between T5 and T9."* That sentence is about the
**30-file population**. AC-3's base is a **per-member** table (§3.3, *"per member, not per file"*), and
deleting `evictOldest` takes it 13 → 12 maximal bodies and 224 → 223 members examined while leaving
the file population untouched. **This is C36's distinction — population versus the figure that
carries the requirement — recurring at the one place §3.1 relied on it.**

**Resolution: T7 takes the delegate shape.** Under it every commit in Phase 2 is green, T1's suites
are byte-identical *and* passing across T7, and T5's frozen base is untouched until T9 as §3.1
promised. *(Amended at T7: "byte-identical" here is about the **counts**; **15 of 15 spans move** —
C50, §10.8. And the delegate keeps that test green because all **three** members it exercises
survive, not four — the cast declares four and `projectRootCache` is type-only, C51.)* T8 still has
its own work and GMS-05 AC-3 is still closed by it — the test is repointed at
the module rather than left reaching a delegate. **T8's *"cannot survive T7 unmodified"* is struck as
falsified**, and its span citation corrected (below). Author level: three criteria converge — §1.1's
per-phase-green obligation, §3.1's frozen-base-unchanged-through-Phase-2 claim, and GMS-05 AC-3 —
and the replacement is one line. Handed to **T25** as a question alongside C37's and AC-2's.

#### C47 — the fifty-second: T6's row credits it with a criterion a module with no call sites cannot close

`spec.md` RFS-02 AC-2 is two clauses: *"The shared module is an **eviction function**, not a cache
class. **No site's TTL or read-promotion policy moves.**"* T6 ships a function that nothing calls, so
it can close the first and **cannot** close the second — every site's policy is still exactly where
T7 will find it. §5's T6 row credits **RFS-02 AC-2** whole. This is the RFS-03 AC-3 / PR-C **C19**
class inverted: not a criterion owned by nothing, but a criterion owned by a task structurally unable
to close it, which reads as closed the moment T6's commit lands. Amended in place: T6 closes **AC-2
clause 1 and AC-3**, T7 closes **AC-2 clause 2** alongside AC-1.

#### The suite's discrimination, two columns

Backed up to scratch copies with SHA-256 byte-identity asserted on restore for all **6** files,
refuse-on-anchor-not-found and refuse-on-byte-identical on every patch, **never `git checkout`**.
Column A is T6's own suite against a mutated module. **Column B is the premise, not an inheritance**:
nothing imports `lru-evict.ts` yet, so — exactly as at T4b, whose subject was also a brand-new file —
there is no population of existing suites that could guard it, and *"the existing suites stay green"*
would be a vacuous column. What is worth knowing, and what no artifact states, is **how much of the
module's contract survives being observed only through the call sites**. So column B applies the
prospective T7 delegate repoint and re-runs T1's oracle against the same mutation.

| # | mutation | A: T6 suite | B: T1 oracle, via the T7 repoint |
| --- | --- | --- | --- |
| M1 | off-by-one, `>` → `>=` | FAIL 6p/9f | FAIL 0p/5f |
| M2 | evicts the **newest** instead of the oldest | FAIL 7p/8f | FAIL 0p/5f |
| M3 | evicts **exactly one** entry (`while` → `if`) | FAIL 12p/3f | **PASS 5p/0f** |
| M4 | eviction neutered entirely | FAIL 7p/8f | FAIL 1p/4f |
| M5 | the `undefined` guard dropped | FAIL 14p/1f | **PASS 5p/0f** |
| M6 | a real import added — AC-3's replacement property, **observed red** (R-29) | FAIL 14p/1f | **PASS 5p/0f** |
| M7 | comment-only edit (**inert control**) | PASS 15p/0f | PASS 5p/0f |
| S1 | suite control: the AST walk's vacuity fixture loses a shape | FAIL 14p/1f | n/a |

**Three of the six real module mutations are invisible to T1's oracle**, and the three are not
arbitrary. **M6 is AC-3's entire replacement property** — the import-freedom that C30 traded kernel
leaf-ness for — and no amount of exercising the call sites can see it. **M5** is the guard. **M3 is
the most interesting**: evict-exactly-one is invisible because **no call site ever grows a `Map` by
more than one per insert**, so the `while` loop's multi-eviction capability is unexercised by the
entire live tree. That is T4b's result one file over (*"ten of thirteen mutations invisible to the
live-tree run"*) and R-40's concern restated: **a shared module's contract is wider than the union of
its callers, and only its own suite covers the difference.**

#### The instrument shipped a dead mutation, and the verdict column could not have shown it

M3's first form was the single patch `while` → `if`. That orphans the `break` inside a non-loop, so
the module is a **syntax error** — `error: Cannot use "break" here` — and the suite reported
**0 pass / 1 fail** because it never loaded. The row read **FAIL / FAIL**, my expectation for M3 was
FAIL, and the harness's own mismatch counter printed **0**. *A mutation that fails to parse is
indistinguishable from a mutation that was caught, by verdict alone.* It was caught only by refusing
to accept an anomalous shape — `0p/1f` against a 15-case suite — rather than the expected verdict.

Corrected to two patches (`while` → `if` **and** `break` → `return`), the row is **FAIL 12p/3f /
PASS 5p/0f**, and the true result — that evict-one is invisible to every call site — is the opposite
of what the dead row implied. The harness now **refuses** on `# Unhandled error between tests` or an
`N error` line rather than reporting a verdict. This is the third author-instrument defect on this
feature (after T1's stdout-only summary read and T5's `:244` anchor), and the second whose figure
reached a table before being caught. *Print the population beside the verdict, and treat a
load failure as a refusal rather than a red.*

#### Gates, all six plus the layering gate

`lint` exit **0**, and proven to bite **on this file** rather than assumed: a duplicate declaration
appended to `lru-evict.ts` produced
`packages/core/src/services/cache/lru-evict.ts:77:7: error: Identifier \`dupProbe\` has already been declared`
and exit **1**; restored SHA-256-identical, lint back to **0**. `type-check` **6/6, 0 cached**
(forced — the unforced run replays). `build` **5/5, 0 cached** (forced; `@massa-ai/core:build`
confirmed `cache bypass, force executing` with `prisma generate` running, because a `Cached: 0` line
is the claim and a 3-second wall clock is not). `test` exit **0**, **11/11 tasks** — **5 cached, and
all five are `:build`** replaying from the forced build two minutes earlier, while **every one of the
6 `:test` tasks executed** under `cache bypass, force executing`; the new suite confirmed *inside* the
aggregate as `@massa-ai/core:test: src/__tests__/lru-evict.test.ts`, not only standalone.
`test:scripts` exit **0**, **1114** pass / 0 fail across **49** files — T4b's and T5's figure
unchanged, as it must be for a commit that adds no `scripts/` test. `test:plugins` exit **0**,
**96** pass / 0 fail across 8 files.

**`check-core-layering` after `git add`: `PASS — 0 violation(s) across 965 tier-to-tier edges in 904
tracked files`.** Read it as **edges 965 unchanged; files 902 → 904** — C36's distinction applied
rather than rediscovered. The module imports nothing, so it contributes no tier-to-tier edge; the
population rises by the two tracked code files T6 adds.

**`check-tools-thin` after `git add`: byte-identical to T5's frozen base** — `2 of 30`, 224 members
examined, `read_file.ts` at 13 / 17 / 2 / 175 and `index_project.ts` at 3 / 3 / 0 / 128. T6 adds no
file under `packages/core/src/tools/`, which is the real precondition R-37 names.

**Coverage (R-36), measured for this file rather than deferred**: `lru-evict.ts` reads **100.00%
funcs / 100.00% lines**. The `undefined`-key case is **not** what earns that — `scripts/check-coverage.ts:318`
parses `DA:` records only and never `BRDA:`, so the guard's line counts as covered the moment it is
evaluated by any case above. The case is kept because it states the guard's behavior, and the module
says in a comment that it is not there for the floor.

#### The Plan Challenge gate on T6 — two modes, ten findings

Both lenses read-only; `git status --porcelain` **and** the SHA-256 of all **10** files they were
pointed at were checked after each returned rather than trusting the agents' own reports — all ten
`OK`, tree unchanged. Mode selection reuses this feature's recorded route (`spec.md` §9.1,
`design.md` §10). **Both modes ran against a plan whose central premise had already been measured**,
which is why the pre-mortem's findings are about consequences rather than about figures.

| # | mode | finding | disposition |
| --- | --- | --- | --- |
| 1 | red-team | T7's commit is red on `test`; fold T8 into T7 | **CONFIRMED in mechanism, REJECTED as stated** — it is true of the inline shape and false of the delegate shape. Became **C46**, which is sharper than the finding: the shape also decides whether AC-3's frozen base moves |
| 2 | red-team | the `fileCache` vacuity is real, and the ownership question is not "fix T1's test" | **CONFIRMED**, independently by the evidence-audit lens's own hand-trace. Became **C45**. Its added point — that `read-file.test.ts` covers the site non-vacuously — is measured and correct, and is what makes C46 load-bearing rather than tidy |
| 3 | red-team | `tasks.md:492` cites `:264-272`; the test runs to `:299` | **CONFIRMED** — `:264` is the `test(`, `:299` the `});`. C34 recorded this at §10.1 and corrected only its own prose, so the row stayed wrong. **Fifth correction on this feature to land in one document and not in the row it is about.** Amended |
| 4 | red-team | T6 cannot close RFS-02 AC-2's second clause | **CONFIRMED.** Became **C47** |
| 5 | red-team | the new AST sensor has no observed red | **CONFIRMED and adopted** — M6 is that red, and S1 is a second one aimed at the vacuity fixture itself |
| 6 | red-team | the `undefined` guard is dead code; the floor is line-only, so the case is not needed for it | **CONFIRMED** — verified `check-coverage.ts:318` reads `DA:` and there is no `BRDA` handling anywhere in the file. Kept as a behavior statement with the reason written in the module |
| 7 | red-team | `file-filter-cache`'s insertion-order ≡ `createdAt`-order invariant is unstated and unenforced | **ACCEPTED** — named in the module's docblock as a blind spot on RFS-01 AC-6's precedent, with T1's M5b named as the only guard |
| 8 | evidence audit | ~50 figures re-derived independently; **none** failed to reproduce, including all 16 LRU line citations, the 29/14 row counts and the layering gate's own three numbers | **CONFIRMED** — the first clean evidence-audit pass on this feature |
| 9 | evidence audit | candidate A confirmed **by algebra** rather than by execution: `size > cap-1 ⟺ size >= cap` over integers | **ACCEPTED, and it is stronger than the empirical result it audited** — A is an exact reformulation of every site, not a configuration that happened to pass. Written into C44 and into the module's docblock |
| 10 | evidence audit | the harness denied it reversible, SHA-verified `/tmp`-only writes, so candidates B and C were hand-traced rather than executed | **RECORDED as an environment fact, not a plan defect.** Its hand-traces agreed with the executed runs on every failing-case identity. *A read-only critic on this harness cannot run the scratch-copy mutation pattern this feature's own instruments depend on — brief it to trace, or expect a weaker column* |

Running total: **fifty-two** plan defects.

#### What T6 pins that no artifact named

1. **A shared module's contract is wider than the union of its callers.** Three of six module
   mutations are invisible to T1's oracle even with the repoint applied, and one of them —
   evict-more-than-one — is unexercised by the live tree entirely, because no call site grows a `Map`
   by more than one per insert.
2. **`spec.md` §3.B's "they retain the same number" is a statement about five sites keeping their own
   operators, not about a predicate they share.** Read as licence to pick one operator, it is false
   in both directions.
3. **RFS-02 AC-3's replacement property has exactly one sensor and it is a unit test.** No mutation of
   the import property is visible to any characterization suite, before or after T7. R-29 called this
   a real loss of enforcement; measured, it is total.
4. **T7's shape is a frozen-base decision, not a style decision** — and §3.1's guarantee that the base
   survives to T9 is true of the file population under either shape and true of the per-member table
   under only one.

### 10.8 T7 — executed, 2026-08-01

**RFS-02 AC-1 closes, and AC-2 clause 2 closes** (reassigned here by C47). Four files, five caches,
repointed at `services/cache/lru-evict.ts`. **The delegate shape at both sites that have a wrapper**,
per C46 and per C48 below. Four new plan defects (**C48–C51**, the fifty-third to fifty-sixth).

**RFS-02 AC-1's evidence is byte-identity, not greenness** (`validation.md` §1's shape). All six
suites that reach any of the five caches are **SHA-256-identical to `HEAD`** across this commit and
pass together at **92 pass / 0 fail / 3335 expect() calls**:

| suite | SHA-256 (first 16) | vs `HEAD` |
| --- | --- | --- |
| `lru-eviction-characterization.test.ts` (T1, AC-1) | `c75e607364fc7d62` | identical |
| `read-file-project-root-rename-pin.test.ts` (T1, AC-4) | `695f9ec8124743f0` | identical |
| `read-file.test.ts` | `e8cf74c6881db255` | identical |
| `symbol-graph-service.test.ts` | `90b1ac21d461198f` | identical |
| `file-filter-cache.test.ts` | `4f4fe6c6729a0f1d` | identical |
| `lru-evict.test.ts` (T6) | `5bda85f632a2e239` | identical |

The last four are a **stronger claim than T7's row made**, and C46 is why they are available: under the
delegate shape no pre-existing suite is even touched, so "unmodified and passing" holds for the whole
eviction surface rather than for T1's two files alone.

#### C48 — the fifty-third plan defect: C46's mechanism at a second site, and no artifact names it

C46 resolved T7's shape for `read_file.ts` and is **textually scoped to that file**. Measured, the
identical question exists at `symbol-graph.service.ts` and nothing in `.specs/` had asked it:

- `symbol-graph-service.test.ts:787-812` reaches `evictOldestProjectRoot` **through a cast**, exactly
  as `read-file.test.ts:264-299` reaches `evictOldest`. Both call the private method by name.
- **`evictOldestProjectRoot` has 0 occurrences anywhere under `.specs/`** — not in `spec.md`,
  `design.md` or `tasks.md`.
- T7's row cites **`symbol-graph.service.ts:808`**, which is the `while` **guard line inside** that
  method. The row treats the site as a bare loop to replace, in the same breath as
  `web-controller.ts:138`, which genuinely is one. The row does not know a wrapper exists.

Measured, as a third column of C46's own table:

| T7 shape at `symbol-graph.service.ts` | `symbol-graph-service.test.ts` | `check-tools-thin` |
| --- | --- | --- |
| **delegate** — keep `private evictOldestProjectRoot()` as a one-line call | **49p/0f/93x — byte-identical** | unchanged |
| **inline** — delete the method, call the module at `:792` | **48p/1f/87x** | unchanged |

**Where it differs from C46, and the difference is the whole finding.** `symbol-graph.service.ts` is
under `services/`, outside `check-tools-thin`'s `tools/` population, so **RFS-01 AC-3's frozen base
does not move under either shape**. The exposure is the other half of C46: §1.1's per-phase-green
obligation, and an **unowned repoint** — T8's write set is `read-file.test.ts` alone, so under the
inline shape a red suite would have arrived with no task claiming GMS-05 AC-3 for it. That is
PR-C's **C19** class again: not a criterion owned by nothing, but a *break* owned by nothing.

**Resolution: the delegate shape at both wrapper sites.** `web-controller.ts` has no method to keep
and is inlined by necessity; `file-filter-cache.ts` keeps its own `private evictOldest()` because it
already had one. Author level on the C46 precedent — the same three criteria converge (§1.1,
GMS-05 AC-3, and RFS-02 AC-1's unmodified-suite requirement) and the replacement is one line.
Handed to **T25** alongside C37's, C41's, AC-2's and C46's.

*A decision recorded against the file that provoked it is not thereby recorded against the class it
belongs to. C46 was measured on `read_file.ts` and stated about `read_file.ts`; the second site had
to be found by enumerating the call sites rather than by reading the resolution.*

#### C49 — the fifty-fourth: two of the five call sites have no sensor anywhere in the repository

C45 established that T1's `read_file · fileCache` case cannot discriminate eviction, and closed with:
*"the site is still covered today by `read-file.test.ts:264-299`."* **That sentence is about the
method and is false about the call site.**

Measured per call site — delete one call, run **every** suite that could see it (the six above, 92
cases, the repo's entire eviction surface):

| call site deleted | all six suites | only sensor |
| --- | --- | --- |
| `read_file.ts:169` — `projectRootCache`, inside the `indexing:started` handler | **92p/0f — NO SENSOR** | none |
| `read_file.ts:462` — `projectRootCache`, workspace lookup | 91p/1f | T1's oracle, `read_file projectRootCache` case |
| `read_file.ts:570` — **`fileCache`** | **92p/0f — NO SENSOR** | none |
| `symbol-graph.service.ts:792` | 91p/1f | T1's oracle, `symbol-graph projectRootCache` case |

**The mechanism is exact.** `read-file.test.ts:264-299` calls `tool.evictOldest(tool.fileCache)`
**directly** through its cast; it never drives `readFileWithCache`. So it characterizes the *method*
and is blind to whether anything still *calls* it. Delete `:570` and all 92 cases stay green. C45's
conclusion survives — T7 keeps the delegate, so the method survives and the test keeps passing — but
its stated reason does not, and the reason is what a later task would have relied on.

**It is live for Phase 3.** **T10** moves `readFileWithCache` + `fileCache` into
`services/file-read/file-content-cache.ts`. If `:570`'s call is dropped in transit, **nothing goes
red** — not T1's oracle, not `read-file.test.ts`, not the coverage floor.

**Decided by the user, 2026-08-01, from three options: close it now by widening T8.** Recording only
(PR-D's log-don't-fix rule, R-07 / RFS-02 AC-4's precedent, and C45's own disposition) and a new task
T8c were both rejected. **T8's write set stays 1 file and its subject widens**: besides repointing the
eviction test at the module, it must drive `handle()` past the cap and drive `indexing:started`, and
assert the cache is bounded — call-site sensors for `:570` and `:169`, landing before Phase 3 moves
them. §5's task count is **unchanged at 29**.

**RFS-02 AC-1 closes on its own text** — the tests exist, cover all four cache sites, pass, and are
byte-identical. A verifier should read AC-1 together with C45 and C49 before treating the word
*"covering"* as a coverage claim: at T7 it means one case per site, two of which are non-discriminating.

#### C50 — the fifty-fifth: the delegate leaves the frozen counts identical and moves all fifteen spans

C46 measured *"byte-identical"* from `check-tools-thin`'s **summary line**, which carries counts.
§3.3's frozen base is a per-member table **with line spans**, and `design.md` §6.6 property 2 is why:
*"every regex detector tried got the per-file verdict right and the per-member count wrong."*

T7's delegate is net **−3 lines** in `read_file.ts` (+1 import, −4 method body). Measured through the
gate's own `--json`, cell by cell:

| | before | after |
| --- | --- | --- |
| counts — maximal bodies / raw / state / `handle()` / members | 13 / 17 / 2 / 175 / 25 | **13 / 17 / 2 / 175 / 25 — identical** |
| spans moved | — | **15 of 15** |
| `index_project.ts` spans moved | — | **0 of 3** |

Five entries shift **+1** (the import): both `ArrowFunction`s, `resolveFilePath`,
`checkPathContainment`, `getProjectRoot`, and both `Map` state sites `:145-146` → `:146-147`.
`evictOldest` itself goes **`:477-483` (7L) → `:478-480` (3L)** — the only length change. Seven shift
**−3**: `calculateRange` through `extractImports`.

**RFS-01 AC-3 as written is untouched** — its text records *"`2 of 30` red (`read_file.ts`,
`index_project.ts`)"*, a verdict, and the verdict does not move. **C46 is not wrong** — its subject
was the counts (13 → 12 maximal bodies, 224 → 223 members) and they are exactly what stayed put. What
neither says is that the *spans* in §3.3's table are as-of-T5 and move at the first Phase 2 commit.

**Why it is not bookkeeping.** §6 item 12 and T25's row both send the verifier to *"re-take T5's
frozen reading against the shipped tree."* T5's own record transcribed those spans and checked them
**cell by cell, 72 assertions, 0 mismatches**. A verifier repeating that against the shipped tree
finds **15 mismatches in `read_file.ts` and 0 in `index_project.ts`**, with nothing recorded saying
which are expected. Author level: AC-3's own text fixes the answer and the replacement is a sentence.
**Owed to §3.3 and to §10.6's table** (both amended in place, below); **not** owed to `design.md` —
§3.3 is this document's own elaboration, so **§8.1 stays at fifteen rows**.

*C42, C39, C43 and now C50 are one family: a figure that is correct for the metric it was measured on
and silently false for the neighbouring metric in the same table.*

#### C51 — the fifty-sixth: the cast declares four members and the body exercises three

**Found by the evidence-audit lens, and it is the mechanism under half of C49.** T8's row says
`read-file.test.ts:264-299` *"reaches four private members"*, and C46's resolution says the delegate
keeps the test green *"because all four members it reaches still exist."* Measured against the block:

| member | in the cast type `:265-270` | referenced in the 32-line body |
| --- | --- | --- |
| `fileCache` | yes | yes — `:276-277`, `:279-280`, `:283-285`, `:289-298` |
| `evictOldest` | yes | yes — `:276`, `:289` |
| `FILE_CACHE_MAX_ENTRIES` | yes | yes — `:272` |
| `projectRootCache` | yes `:267` | **no — zero references** |

The count is right about the **cast** and wrong about what the test **reaches**: three, not four. The
conclusion survives — the annotation is a `as unknown as` cast, unchecked, so an absent member breaks
nothing — but the figure is what makes `read-file.test.ts` **not a sensor for
`read_file · projectRootCache`**, which is one half of C49 and was invisible while the row said four.
Author level; owed to **T8's row** and to **C46's resolution sentence**, both amended in place.
*"A field name is not its subject" — here a declared field is not an exercised one.*

#### The discrimination table, two columns

Backed up to scratch copies with SHA-256 byte-identity asserted on restore for all **4** files,
refuse-on-anchor-not-found, refuse-on-byte-identical, **refuse-on-load-failure** (T6's dead-mutation
lesson, carried forward as harness policy). **Never `git checkout`.**

**Choosing column B.** T7 ships no new test file, so *"the subject's own suite"* is not a new
artifact — the subject is the repoint and its designated sensor is T1's oracle. The premise T7 rests
on is C44's **per-site** pairing, and C44 measured only the whole-tree shared-operator candidates. So
column B is **the suites that existed before PR-D** (`read-file.test.ts`, `symbol-graph-service.test.ts`,
`file-filter-cache.test.ts`), run as one union at a 70-case baseline. That is the honest
counterfactual for RFS-02 AC-1: *if PR-D had repointed these five caches without writing T1, what
would have caught a per-site argument error?*

| # | mutation | A: T1 oracle | B: pre-existing suites |
| --- | --- | --- | --- |
| M1 | `read_file` passes `CAP`, not `CAP - 1` — off-by-one at **both** its caches | FAIL 4p/1f | FAIL 69p/1f |
| M2 | `symbol-graph` passes `CAP`, not `CAP - 1` | FAIL 4p/1f | FAIL 69p/1f |
| M3 | `web-controller` passes `CAP - 1` — a pre-insert reservation at a post-insert site | FAIL 4p/1f | **PASS 70p/0f** |
| M4 | `file-filter-cache` passes `CAP - 1` — the same error at the cap-50 site | FAIL 4p/1f | **PASS 70p/0f** |
| M5 | `read_file`'s delegate body emptied — eviction neutered at both its caches | FAIL 4p/1f | FAIL 69p/1f |
| M6 | `web-controller`'s eviction call deleted entirely | FAIL 4p/1f | **PASS 70p/0f** |
| M7 | `read_file` read-promotion removed at `projectRootCache` (`delete`+`set` → `set`) | FAIL 4p/1f | **PASS 70p/0f** |
| M8 | comment-only edit at the delegate call (**inert control**) | PASS 5p/0f | PASS 70p/0f |

Expectation mismatches: **0**. Control holds at the 5p/0f and 70p/0f baselines.

**Column B misses 4 of 7 real mutations**, and the pattern is not arbitrary: **both post-insert sites
are entirely unsensed by the pre-PR-D tree** (M3, M4, M6), and read-promotion at `read_file`'s root
cache is too (M7). `file-filter-cache.test.ts:94` asserts
`expect(cache.cache.size).toBeLessThanOrEqual(3)` — an **upper bound only**, so evicting *too much*
satisfies it and M4 walks through. **This is RFS-02 AC-1's justification, measured rather than
argued**: T1's suite is the only sensor for four of seven per-site repoint errors.

**Every FAIL in column A is `4p/1f`, and the arithmetic is C45 recurring.** M1 and M5 both reach
**both** `read_file` caches and both kill exactly **one** case — `projectRootCache`'s. Confirmed by
reading the failing case name rather than the count:

| variant | oracle | failing case |
| --- | --- | --- |
| T7 delegate, unmutated | 5p/0f | — |
| M1 off-by-one | 4p/1f | `read_file projectRootCache … evicts the oldest projectId on the 513th` |
| M5 neutered | 4p/1f | the same case |

C45 measured the **neuter** only. The vacuity of `read_file · fileCache`'s characterization case
covers the **off-by-one too**, which is the shape a repoint is far likelier to introduce.

#### Gates, all six plus both structural gates

`lint` exit **0**, and proven to bite **on a T7 file** rather than assumed: a duplicate declaration
appended to `file-filter-cache.ts` produced
`packages/core/src/services/search/file-filter-cache.ts:236:7: error: Identifier \`dupProbe\` has already been declared`
and exit **1**; restored SHA-256-identical (`f297d9c5…`), lint back to **0**. `type-check` **6/6, 0
cached** (forced). `build` **5/5, 0 cached** (forced), and confirmed executing rather than claimed —
`@massa-ai/core:build: cache bypass, force executing` with `✔ Generated Prisma Client (v7.8.0)` in the
log. `test` exit **0**, **11/11 tasks**, **5 cached and all five are `:build`**, 0 failing cases.
`test:scripts` exit **0**, **1114** pass / 0 fail across **49** files — T4b/T5/T6's figure unchanged,
as it must be for a commit that adds no `scripts/` test. `test:plugins` exit **0**, **96** pass / 0
fail across 8 files.

**`check-core-layering` after `git add`: `PASS — 0 violation(s) across 969 tier-to-tier edges in 904
tracked files`.** Read it as **edges 965 → 969; files 904 unchanged** — C36's distinction applied, and
this is the first commit on this branch where the edge count is the figure that moves. The delta is
exactly the four new imports: `tools/read_file.ts → services/cache/` is a legal `tools → services`
edge, and the other three are intra-`services/`. **Files do not move because T7 adds no file.**

**`check-tools-thin` after `git add`: counts byte-identical to T5's frozen base** — `2 of 30`, 224
members examined, `read_file.ts` at 13 / 17 / 2 / 175 and `index_project.ts` at 3 / 3 / 0 / 128, exit
**1**, which remains the intended pre-Phase-5 state. **Spans are not byte-identical — see C50.**

#### `bun run test` exited 1 on its first run and it is not PR-D's

Two failures, both `@massa-ai/mcp-client`, both in the 5001 ms / cold-model class `CLAUDE.md`
documents. Measured rather than assumed, because one of them — `POST web/fetch_and_index` — reaches
`WebController.fetchAndIndex`, a file **this task edits**:

| run | tree | config dir | result |
| --- | --- | --- | --- |
| aggregate, cold | T7 applied | real | `POST web/fetch_and_index` **fail** 22821 ms |
| standalone | T7 applied | real | `POST memory/list with level filter + type` **fail** 20167 ms |
| standalone | T7 applied | `XDG_CONFIG_HOME=$(mktemp -d)` | **95p/0f, exit 0** |
| standalone | **T7 reverted to `HEAD`** | real | 95p/0f |
| standalone | T7 applied | real, **model now warm** | **95p/0f, exit 0** |
| aggregate, warm | T7 applied | real | **11/11, exit 0** |

**The failing case identity moves between runs** and neither case is reachable from any of the four
edited files — `memory/list` touches none of them. `apps/mcp-client/` is **zero-diff against `main`**.
`~/.config/massa-ai/config.json` has `llm.enabled = true` on this machine. **The reverted-tree run is
confounded and is recorded as such**: three runs had already warmed the model, so its green proves
nothing on its own. The decisive column is the last two — *the same tree and the same config, cold
then warm* — which isolates warmth rather than the diff. T3 recorded this class; T4a recorded the
disjoint-failing-set signature. All readings are kept, not only the green ones.

#### The Plan Challenge gate on T7 — two modes, and the critics were briefed to attack a measurement

Mode selection reuses this feature's recorded route (`spec.md` §9.1, `design.md` §10). Per §10.7 gate
finding 10, a read-only critic on this harness **cannot run the scratch-copy mutation pattern this
feature's instruments depend on**, so both lenses were handed the shape-probe results to attack rather
than asked to reproduce them. `git status --porcelain` and the SHA-256 of every file they were pointed
at were checked after each returned.

| # | mode | finding | disposition |
| --- | --- | --- | --- |
| 1 | red-team | bare `grep` in this harness fabricated a fully-executed T7 state across four files while `git status` showed the tree clean — *"critical; any evidence gathered with bare `grep` is unverified"* | **CONFIRMED in mechanism, REJECTED as stated, and the true cause is worth more.** `grep` **is** a shell function here (verified: `type grep` → `shell-snapshots/…`). But re-run on a clean tree it returns **0 hits** in `web-controller.ts`, agreeing with `command grep`, `rtk proxy`, `awk` and `git diff`. The critic ran **concurrently with three mutation harnesses of mine**, each of which applies the T7 diff, runs suites and restores. It grepped a tree that genuinely had T7 applied, then ran `git status` after a restore. **Nineteenth time on this feature that a critic's mechanism held while its conclusion did not** — and the real rule is new: *a read-only critic dispatched while a mutation harness is running observes a tree that is time-inconsistent across its own commands. SHA-verified restore is a claim about the end state, not about what a concurrent reader sees.* **Do not overlap the two.** |
| 2 | red-team | C46's delegate decision is textually scoped to `read_file.ts`; extending it to `symbol-graph.service.ts` is necessary but recorded in no task row or C-number | **CONFIRMED**, independently of the author's own finding, and sharpened: the exposure is **GMS-05 AC-3 unclaimed for that file**, not merely an unassigned repoint. Became **C48** |
| 3 | red-team | the dropped `logger.debug` is an observable behavior change with no AC deciding it; record the choice rather than let the diff decide it silently | **CONFIRMED and put to the user.** Both lenses reached this independently. Decided: **drop it, record the drop** — the module cannot report a victim key, the other four unified sites do not log at all, and the line had 0 assertions repo-wide. Priced in `file-filter-cache.ts`'s own docblock on RFS-04's precedent of pricing 0-consumer removals |
| 4 | red-team | `CAP - 1` is correct at every pre-insert site, including the `delete`-preceded `:169` | **ACCEPTED as confirmation.** Independently re-derived: `:169`'s preceding `delete` is idempotent and does not change the post-call bound |
| 5 | red-team | `file-filter-cache`'s insertion-order ≡ `createdAt`-order invariant holds **unconditionally**, not merely *"because a read never re-inserts"* as the author traced | **ACCEPTED, and it is stronger than the trace it audited.** Every write either inserts fresh with the current `Date.now()` or deletes without reordering survivors; the TTL-expiry path is one instance rather than the reason. Written into the site's docblock. Second time on this feature an audit lens produced a result stronger than the empirical one it was checking |
| 6 | evidence audit | ~40 figures re-derived with independently written commands — all five call sites and predicates, six suite counts, the `evictOldestProjectRoot` population (6 tracked / 0 in `.specs/`), 2267 tracked files / 416 test files, the gate's full per-member reading against T5's frozen base, §5's 29 rows, §8.1's 15 rows, the running total 52 | **CONFIRMED — every figure reproduced**, at both file and per-member granularity. Second clean evidence-audit pass on this feature |
| 7 | evidence audit | `read-file.test.ts:264-299`'s cast **declares** four private members and the body **exercises** three; `projectRootCache` is type-only | **CONFIRMED.** Became **C51**, and it is the mechanism under half of C49 |
| 8 | evidence audit | `evictOldest(cache, maxRetained)`'s negative-argument path (`CAP = 0` → `maxRetained = -1`) is correct by hand-trace but has no dedicated test | **ACCEPTED as a recorded gap, not a defect.** `while (size > -1)` empties the map and the `undefined` guard stops it; unreachable from all five sites, whose caps are 512 and 50. Noted for T25 rather than fixed, on RFS-02 AC-3's precedent |
| 9 | evidence audit | C35 and C36 are absent from the plan-defect ordinal series, which reads as a gap | **RECORDED as a stated category distinction, not an arithmetic error** — they are author-level entries, and the C33→C47 ordinal chain is unbroken. Re-verified here: C48–C51 continue it to **fifty-six** |

Running total: **fifty-six** plan defects.

#### What T7 pins that no artifact named

1. **A shape decision recorded against one file is not recorded against its class.** C46 was measured
   on `read_file.ts` and stated about `read_file.ts`; the structurally identical site one module over
   had to be found by enumerating call sites, not by reading the resolution (**C48**).
2. **A characterization test of a method is not a characterization of its wiring.** Two of the five
   call sites can be deleted outright with all 92 cases green (**C49**), and the one the plan believed
   covered — `read_file · fileCache` — is one of them.
3. **A per-site sensor is not derivable from a whole-tree one.** C44 measured three whole-tree
   operator candidates; the per-site table shows the pre-PR-D suites miss **4 of 7** argument errors
   and are blind to both post-insert sites entirely.
4. **Counts and spans are different metrics of the same frozen table**, and *"byte-identical"* has to
   say which it means (**C50**): 15 of 15 spans move while every count holds.
5. **A read-only critic must not run concurrently with a mutation harness on the same tree.** Its
   commands are individually honest and collectively time-inconsistent, and the resulting finding is
   indistinguishable from a tooling defect (gate finding 1).
