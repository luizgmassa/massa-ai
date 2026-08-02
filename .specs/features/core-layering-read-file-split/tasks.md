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
| **2 — LRU** | ~~7~~ → ~~9~~ → **13** | 2 | `services/cache/lru-evict.ts` + its unit test + **4** repointed sites + `read-file.test.ts` + ~~T8b's 2 comment sites~~ → **T8b's 8 source files + `spec.md`** (§10.10, C54: `production-wiring.ts`, `invalidator-registry.ts`, `read_file.ts`, `symbol-graph.service.ts`, `file-filter-cache.ts` and the three Phase-0 suites; the first two and `spec.md` are the only ones new to this phase, and `spec.md` is new to the whole set). **Corrected at T10 — C65 (§10.12), and it is not T10's own work**: T8b's write set grew from 2 to 9 on a user decision and this row was never carried back, so §1 asserted **9** for two tasks while §5's own T8b row said 8 + `spec.md` |
| **3 — the extraction** | ~~13~~ → ~~14~~ → ~~20~~ → ~~25~~ → **29 so far** | 14 | `read_file.ts` + **6** modules + **6** module suites + **C34's `read-file.test.ts` repoint** + **T9's 6 citation-repoint files** (§10.11) + **T10's 5 further ones** (§10.12: `lru-evict.test.ts`, `symbol-graph.service.ts`, `production-wiring.ts`, `invalidator-registry.ts`, `read-file-presentation-characterization.test.ts` — its other six files were already in the set, `read-file-project-root-rename-pin.test.ts` among T9's own six) + **T11's 4 further ones** (§10.13: `line-range.ts` and `line-range.test.ts` are the 2 new; `wave-4-correctness.test.ts` and `spec.md` are new to **this phase**, the latter already in the union via Phase 2 — the presentation suite and the two `check-tools-thin` files were already here). **Still rising**: C55 makes T12 re-derive its own citation count and it is not taken yet |
| **4 — `index_project.ts`** | **9** | 6 | 1 handler + **3** modules + 3 module suites + **2** test repoints |
| **5 — the gate goes green** | **1** | 0 | `.github/workflows/ci.yml` |
| **6 — the rename** | **29** | 0 | **7** `git mv` + **19** external importers + **3** prose/fixture sites |
| **7 — the record** | **16** | 1 | RFS-04's 5 + RFS-05's 9 + `design.md` (T20b) + `validation.md` |
| **sum** | ~~83~~ → ~~86~~ → ~~92~~ → ~~101~~ → **105** | **30** | Phase 2 **+4** and Phase 3 **+9** since the 92 |
| **distinct union** | ~~78~~ → ~~80~~ → ~~81~~ → **84** | | **unchanged by T9** — all 6 files it added to Phase 3 were already in the set. **T10 adds none either**; the **+1** there is `spec.md`, which T8b brought in and which no row recorded (**C65**). **T11 adds 3**: `line-range.ts`, `line-range.test.ts` and `wave-4-correctness.test.ts` — `spec.md` and the two `check-tools-thin` files were already in the union. Against PR-C's planned **104** and PR-B's **37** |

**Both figures are corrected at T4b (§10.5), and neither correction is T4b's own work** — they are
the two amendments §10 recorded without carrying back into this table. **C35** minted T8b with two
brand-new files (`production-wiring.ts`, `invalidator-registry.ts`), which appeared in no phase row;
**C34** added `read-file.test.ts` to T10, a file Phase 2 already carried. So the sum rises by 3 and
the union by 2 — C34's file is already inside the distinct set, and what it adds is a **sixth**
overlap rather than a seventy-ninth file. *An execute-time amendment that adds a file is a claim
about the planning table, and nothing was watching that table.*

**The phases are not disjoint, and the sum is not the review surface.** Measured: ~~**5**~~ → ~~**6**~~
→ ~~**12**~~ → ~~**17**~~ → **18 files in more than one phase, three of them in three phases**, which
is what takes ~~83 to 78~~ → ~~86 to 80~~ → ~~92 to 80~~ → ~~101 to 81~~ → **105 to 84**.

***The identity changed and the old sentence would now be false.*** It read *"the table sums to its own
total: 92 − 80 = 12, and the overlap rows below enumerate exactly 12 files"* — which holds only while
every overlapping file is in **exactly two** phases. T8b put the three Phase-0 suites into Phase 2 and
T9 put them into Phase 3, so each contributes **2**, not 1. The identity is
`sum − union = Σ (phases containing the file − 1)`, and it checks out: ~~8 files × 1 + 3 files × 2 +
the six below × 1 = 20 = 101 − 81~~ → **15 files × 1 + 3 files × 2 = 21 = 105 − 84** at T11, the
fifteenth being `spec.md`, which T8b brought into Phase 2 and T11 brings into Phase 3 (**C68**).
*A self-checking table stops self-checking when a file enters a third phase, and nothing said so —
so the check is re-run per task rather than trusted.*

| overlap | files |
| --- | --- |
| Phase 0 ∩ Phase 1 (**1**) | **this document** — created at Phase 0, and T5 writes the frozen reading into it. Reported by the Plan Challenge gate (§8, evidence finding 2); the first draft's per-phase rows omitted it and it self-cancelled in the union, which is how it survived a check that only verified the total |
| Phase 2 ∩ Phase 3 (~~**1**~~ → ~~**2**~~ → ~~**3**~~ → ~~**7**~~ → **8**) | `packages/core/src/tools/read_file.ts` — the LRU repoint, then the extraction; **`read-file.test.ts`** — T8's eviction repoint, then **C53**'s at T9 and **C34**'s at T10; **`services/cache/lru-evict.ts`** — written at T6, its site table repointed at T9 and again at T10; **four added at T10** (§10.12) — `lru-evict.test.ts`, `symbol-graph.service.ts`, `production-wiring.ts`, `invalidator-registry.ts`, each carrying a by-FILE or by-IDENTIFIER claim T10 falsifies; and **`spec.md` added at T11** (§10.13) — T8b brought it into Phase 2 for RFS-02 AC-4's evidence table, and **C68** corrects its §6 duplication rows here. It is the file whose second phase takes the identity above from 20 to 21 |
| Phase 0 ∩ Phase 2 (**3**) | `read-file-containment-shapes.test.ts`, `read-file-project-root-rename-pin.test.ts`, `lru-eviction-characterization.test.ts` — **this pair was missing from the table entirely** (**C65**, §10.12). T8b's C54 growth put all three Phase-0 suites into Phase 2 and no row recorded it, which is also why they now sit in **three** phases each |
| Phase 0 ∩ Phase 3 (~~**3**~~ → **4**) | the same three — **added at T9** (§10.11), all Phase-0 suites whose comments cite spans T9 relocates; the third is RFS-02 AC-1's own main subject, which **C56 recorded as unchanged** and **C58** falsifies — plus **`read-file-presentation-characterization.test.ts`, added at T10** |
| Phase 1 ∩ Phase 3 (**2**) | `scripts/check-tools-thin.ts` and its unit suite — **added at T9**. The gate's own docblock cited the `eventBus.subscribe` arrow it measures, and T9 moves that arrow out of `tools/` altogether (**C57**). T10 edits the gate again, for the by-FIGURE claim in its implementation (**C63**). **T11 edits both a third time** (**C69**, §10.13) — this time the gate's *code*, not its prose: `membersExamined` was pinned at 2 top-level nodes per file, and the suite's six assertions on that member were all shape assertions that pass at 2 as readily as at 14 |
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
`--json`: ~~the delegate is net **−3 lines** in `read_file.ts`~~ → **amended by C52 (§10.9): the
delegate as SHIPPED is net +8 lines, `707 → 715`**, so **15 of 15** entries move (13 bodies
+ 2 state sites) while **every count holds** at 13 / 17 / 2 / 175 and 25 members; `index_project.ts`
moves **0 of 3**. Five shift **+1** for the added import, ~~seven shift **−3**~~ → **seven shift
`+8`**, and `evictOldest` itself goes `:477-483` (7L) → ~~`:478-480`~~ → **`:489-491`** (3L).
**The struck figures were taken on a tree that was never committed** — the shape probe applied a
minimal delegate (`+1` import, `−4` body) while the shipped commit also carries an 11-line docblock,
`git show --stat ea59b04` = `+13/−5`. The re-measurement against the shipped tree is T8's, §10.9.
**A verifier re-taking this reading against the shipped tree
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
| **T8** | **Repoint `read-file.test.ts`'s eviction test** (~~`:264-272`~~ → **`:264-299`**, `describe` `:257-300`), which reaches four private members ~~and cannot survive T7 unmodified~~. **Both amended at T6 (§10.7).** The span: C34 measured `:264-299` at T1 and corrected only §10.1's prose, leaving this row wrong for five tasks — the fifth correction on this feature to land in one document and not in the row it is about. The clause: **falsified by measurement** — under T7's delegate shape (C46) the test passes **7p/0f/34x, byte-identical to baseline**, because ~~all four members it reaches~~ → **all three members it exercises (C51, §10.8: the cast at `:265-270` declares four; `projectRootCache` at `:267` has zero references in the body)** still exist. Confirmed at T7: byte-identical and green, `e8cf74c6881db255`. It survives T7 and is repointed here anyway, because Phase 3 removes its subject. **GMS-05 AC-3: repointed, not weakened, skipped or deleted** — the CAP+1 eviction and hot-key-promotion assertions must still run, against the module. ~~**It is also the only non-vacuous sensor for `fileCache` eviction until this task runs** (C45)~~ → **amended by C49 (§10.8): it is the only non-vacuous sensor for the `evictOldest` *method*, and no sensor at all for the *call sites*.** Measured across all 92 cases in the six eviction suites: deleting `read_file.ts:570` (`fileCache`) or `:169` (`projectRootCache`) leaves **92p/0f — nothing goes red**, because this test calls `tool.evictOldest(tool.fileCache)` directly and never drives `readFileWithCache`. **This task's subject widens to close that** — **decided by the user, 2026-08-01**, from three options; recording only and a new task T8c were rejected. Besides the repoint it must **drive `handle()` past the cap and drive `indexing:started`, asserting the cache is bounded** — call-site sensors for `:570` and `:169`, landing before **T10** moves `:570`'s call into `services/file-read/file-content-cache.ts` with nothing watching. Write set is still **1 file**; §5's task count is still **29**. **DONE at `HEAD` — §10.9.** The repoint
landed as an **operator swap in place**, not a move onto a bare `Map`: the case still drives
`ReadFileTool`'s own `fileCache` and still pins the cap against `FILE_CACHE_MAX_ENTRIES`, because
`lru-evict.test.ts:60` and `:70` already assert both properties over a plain `Map` and a repoint onto
one would have been a **duplicate of T6 and a deletion wearing a repoint's clothes** (Plan Challenge
gate, §10.9 finding 3). Both sensors flip their site from `92p/0f` to `93p/1f` | 1 file | GMS-05 AC-3, **C49** |
| **T8b** | ~~**The two comments RFS-02 AC-4 requires corrected**~~ → **five comment sites, three of them added by C52 (§10.9) — `production-wiring.ts:67-68` and `invalidator-registry.ts:34-36`.** Both state the same false claim and the **named site cites the unnamed one as its authority**, so correcting only the named one leaves a reader who follows its own pointer at the uncorrected claim (**C35**, §10.1). Corrected to state what T1's pin measured: `CACHE_TTL` is enforced, `ROOT_CACHE_TTL` is **not**, and no invalidator id matches `read_file`. **Added by C35 at T1; this row was created at T4b** — C35 resolved the defect and named the task but never wrote a row for it, so for four tasks T8b existed only in §10.1's prose and was absent from §5 and from §1's write-set table (§10.5). **Three further comment sites added by C52 (§10.9), decided by the user, 2026-08-01, from four options** — widening T8 to 4 files, a new task T8c and record-only were all rejected; this row was chosen because its charter already *is* comment correction, so *"comments only"* stays true and T8's write set stays at 1 file. All three were **added by T7 itself** and cite line numbers in their own file that T7's own commit falsified: `read_file.ts:484` (`:169, :462, :570` → **`:170`, `:463`, `:578`**), `symbol-graph.service.ts:812` (`:792` → **`:793`**), `file-filter-cache.ts:151` (`:51-53` → **`:52-54`**). **`read_file.ts`'s is de-numbered rather than renumbered** — T10 deletes `:578`'s call outright, so a renumber there would be falsified a third time; the other two files appear in **no** Phase 3–5 write set, so a plain renumber is stable. **DONE at `HEAD` — §10.10. Phase 2 is complete.** The write set grew again *during* the task, **decided by the user from four options**: C52's sweep was **self-referential**, and T7's `+1` import insertions falsify a citation *into* those files from anywhere — measured over 892 tracked source files, **14 explicit cross-file citations plus a bare-`:NNN` tail, 48 stale across the three Phase-0 suites**, three of which **invert** (`read-file-project-root-rename-pin.test.ts:8`/`:173`/`:174` name `read_file.ts:147`/`:148`, which on the shipped tree are the `projectRootCache` Map and `CACHE_TTL` — the constant the sentence says is never read). **C54**, §10.10; assigning them to Phase 3, de-numbering all, and record-only were rejected. **`spec.md` is edited too, and that is a second user decision**: an honest correction to `production-wiring.ts:67-69` needs ~6 lines, and the growth shifts the **2** citations below it — `spec.md:156` (`:105` → **`:114`**) and `:158` (`:91` → **`:100`**), both in §3.B's evidence table. The `read_file.ts` edit is **line-neutral by construction** (four lines replacing four), so `check-tools-thin` comes back **byte-identical, spans included** — stronger than T7's and T8's counts-only claim. **Nine `:NNN` in `test()` title strings are deliberately left stale** and are T12's: editing a string literal would make *"comments only"* false | ~~2~~ → ~~5~~ → **8 files + `spec.md`, comments only** | **RFS-02 AC-4**, **C52**, **C54** |

### Phase 3 — the extraction, 490 of 707 lines

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T9** | **Modules 2 and 3** — `services/file-read/path-containment.ts` (`checkPathContainment` `:387-448` + `resolveFilePath` `:350-385`) and `services/file-read/project-root-cache.ts` (`getProjectRoot` `:450-470` + `projectRootCache` + `ROOT_CACHE_TTL` + the `eventBus` subscription `:162-171`). **Module 2 → module 3 is a real edge** — `:373` and `:415` both call `getProjectRoot` — one-directional, so no cycle, but module 2 cannot be constructed without module 3. T2's suite passes unmodified. **Write set gains `+ 1 test repoint` — added by C53 (§10.9), and it is C34's resolution one task earlier than C34 predicted.** This module takes `projectRootCache` **and** the `eventBus` subscription, so T8's new `indexing:started` call-site sensor — which seeds `tool.projectRootCache` through a cast — loses its subject **here**, not at T10. §1's overlap table scheduled the only Phase-3 touch of `read-file.test.ts` at T10 (C34's), so T9 as written lands a red suite owned by nothing — PR-C's **C19** class, and C48's *"a break owned by nothing"* verbatim. Author level on C34's own precedent: GMS-05 AC-3 fixes the answer and the only open question was which task carries one file. **Also `+ N citation repoints` — added by C55 (§10.10)**: T8b renumbered 48 citations into `read_file.ts` spans, and this task moves `resolveFilePath`, `checkPathContainment`, `getProjectRoot`, `projectRootCache` and `ROOT_CACHE_TTL` out of the file, so the citations naming them in `read-file-containment-shapes.test.ts` and `read-file-project-root-rename-pin.test.ts` name a file that no longer holds the code. **Re-run the sweep here; do not inherit T8b's count** — measured **21 citation sites in 7 files**, not T8b's 48 and not the 14 the first sweep returned. **DONE at `HEAD` — §10.11.** The write set grew from the **8** files this row and C55 together predict to **12**, **decided by the user from three options** (fix-all-now chosen; line-citations-only and defer-to-T12 rejected): the sweep's bare-`:NNN` half was still hand-scoped to three carriers and its **by-file / by-identifier** half had never been swept at all, so four more files carry a claim T9 falsifies — `lru-eviction-characterization.test.ts` (RFS-02 AC-1's **own main subject**, which C56 explicitly recorded as unchanged), `services/cache/lru-evict.ts`, and **`scripts/check-tools-thin.ts` plus its suite**, the gate's own docblock having cited the `eventBus.subscribe` arrow at `:167-171` since T7 falsified it (**C57**). A second user decision folded in the two citations **into** `read-file.test.ts` that T8 left orphaned. All six citation-only diffs **proven** comment-only | ~~1 handler + 2 new modules + 2 new suites~~ → ~~+ 1 test repoint + N citation repoints~~ → **12 files: 2 new modules + 2 new suites + 1 handler + 1 test repoint + 6 citation repoints** | **RFS-06 AC-1**, GMS-05 AC-3, RFS-03 AC-1/AC-2 |
| **T10** | **Modules 4 and 5** — `file-content-cache.ts` (`readFileWithCache` ~~`:518-580`~~ → **`:401-463`** + `fileCache` + `CACHE_TTL` + `FILE_CACHE_MAX_ENTRIES` + `interface CachedFile`) and `file-metadata.ts` (`extractMetadata` ~~`:582-628`~~ → **`:465-511`** + `detectLanguage` ~~`:645-681`~~ → **`:528-564`** + `extractImports` ~~`:683-706`~~ → **`:566-589`** + `interface FileMetadata`). **Every span in this row was pre-T7 and pre-T9; all nine were re-derived from the AST and anchor-verified at execute time (§10.12).** **The 4 → 5 edge is a callback — §4.** Module 4 never names `SymbolGraphService`, though it type-imports `FileMetadata`, which is what §4.1 permits and not what it forbids. **`+ N citation repoints` — added by C55 (§10.10)**: this task takes `CACHE_TTL`, `fileCache` and `readFileWithCache`, which the pin suite and the presentation suite both cite by line. **It also DELETES the `evictOldest` delegate, one task earlier than every artifact said — added by C60 (§10.12)**: the wrapper's body reads `FILE_CACHE_MAX_ENTRIES`, which this row moves, so it cannot compile once the field leaves the class. Author level; GMS-05 AC-4 fixes the answer. **DONE at `HEAD` — §10.12.** The write set grew from the **5 + N** this row predicts to **17**, **decided by the user from three options** (fix-all-now chosen; leaving C61's file to T12 and deferring all eight by-claim files to T12 both rejected): beyond the two line-citation files, **eight** files carry a by-FILE, by-IDENTIFIER or by-FIGURE claim T10 falsifies — two of them production files whose *qualified* `ReadFileTool.CACHE_TTL` stops resolving, which is the other half of the finding T9 rejected for *unqualified* identifiers (**C63** for the by-FIGURE class, in the gate's own source) — and a ninth carries two citations T9's sweep was structurally blind to (**C61**). All eleven citation diffs **proven** comment-only | ~~1 handler + 2 new modules + 2 new suites + N citation repoints~~ → **17 files: 2 new modules + 2 new suites + 1 handler + 1 test repoint + 11 citation repoints** | GMS-05 AC-3, **C34**, RFS-03 AC-1/AC-2 |
| **T11** | **Module 6** — `line-range.ts` (`calculateRange` ~~`:485-507`~~ → **`:345-367`** + `adjustRange` ~~`:509-516`~~ → **`:369-376`** + `extractLines` ~~`:630-643`~~ → **`:378-391`** + `interface ReadRange` **`:53-56`** + `MASSA_AI_READ_FILE_MAX_LINES` `:22-36` **comment-inclusive, decl `:33-36`** + **the N9 clipping** ~~`:235-249`~~ → **`:230-244`** comment-inclusive, which is 15 of `handle()`'s 98 non-delegation lines). **Every span in this row was pre-T7, pre-T9 and pre-T10; all six were re-derived from the AST and anchor-verified at execute time (§10.13)** — only `MASSA_AI_READ_FILE_MAX_LINES` was still exact, and only because it sits above everything three tasks removed. **`+ N citation repoints` — added by C55 (§10.10)**: `extractLines` is cited by the presentation suite; **measured, N = 2** — that suite carries a second row **C62** assigns here, the constructor citation nobody else moves. **The module is FREE FUNCTIONS, not a class** — it owns no per-tool state, on module 1's precedent (`design.md` §5.2) — and it **imports nothing at all**. **It also declares `interface LineRangeRequest` — added by C66 (§10.13)**: `calculateRange` takes `ReadFileParams`, which `design.md` §5.1 assigns to **module 7**, so module 6 as specified imports from the module that composes it; the four fields it actually reads are declared here instead and `ReadFileParams` satisfies them structurally. **DONE at `HEAD` — §10.13.** The write set grew from the **6** this row and C55 together predict to **8**, **decided by the user from four options on the gate half and three on the spec half**: `spec.md` §6's row cites two sites for a variable neither sets and its table was short a third read of the N9 cap (**C68**), and `scripts/check-tools-thin.ts` plus its suite carry a defect the gate's own evidence-audit lens found in the gate — `forEachChild(() => membersExamined++)` short-circuits, pinning the population print at 2 top-level nodes per file (**C69**, fixed here with its recalibration recorded; record-only, fix-without-record and a new T11b were rejected). Both citation diffs **proven** comment-only | ~~1 handler + 1 new module + 1 new suite + N citation repoints~~ → **8 files: 1 new module + 1 new suite + 1 handler + 2 citation repoints + `spec.md` + the gate and its suite** | **C66**, **C67**, **C69** |
| **T12** | **Module 7 and the handler's collapse** — `read-file.service.ts` takes `interface ReadFileParams`, the compression decision `:251-255`, result assembly `:257-283`, token math + recommendation `:285-322` and usage tips `:324-336`, and composes 2–6. **Every span here is pre-T7/pre-T9/pre-T10 and must be re-derived from the AST, as T9 and T10 both had to** (§10.11, §10.12). ~~It also deletes the `evictOldest` delegate~~ → **struck: T10 deleted it, because its body read `FILE_CACHE_MAX_ENTRIES` and could not compile once T10 moved that field (C60, §10.12).** **It MUST also take the 4 → 5 wiring arrow** — `read_file.ts`'s constructor builds the callback with an arrow, which the constructor's exempt-by-kind status makes a **maximal** body (C64, §10.12), so `read_file.ts` cannot reach maximal 0 and RFS-01 AC-1 cannot read `0 of 30` until that composition moves into module 7. **Confirmed at T11 (§10.13): `read_file.ts` now reads maximal 1 / raw 1, and that single body IS the arrow at `:144-145`** — so this obligation is the whole remaining distance to `0 of 30` for this file. **`handle()` goes ~~175~~ → 165 → ~15**; `read_file.ts` ~~392~~ → **315** → **≤ 125** (N). **Do NOT re-unify `LineRangeRequest` with `ReadFileParams` (C66, §10.13)**: module 6 declares the four fields `calculateRange` reads precisely so it does not import from the module composing it, and module 7 passing its own `ReadFileParams` satisfies them structurally with no call-site change. Merging them recreates the 6 → 7 edge C66 exists to remove. **`serializeToolResponse` stays in the handler** (`:338`) — any `services/file-read/` module importing `tools/serialize.ts` is a `services → tools` edge and fails `check-core-layering` (RFS-03 AC-2). **`constructor(symbolGraph?: SymbolGraphService)` keeps its exact arity and parameter type** — 20 construction sites, both transports among them (`design.md` §3.2). **MCP `inputSchema` + REST `/file` response shape byte-identical.** **The four moving interfaces are invisible to consumers**: `read_file.ts` exports exactly one symbol (`ReadFileTool`, `:74`), so `ReadFileParams`, `FileMetadata`, `CachedFile` and `ReadRange` are module-local today, and `services/file-read/` is deliberately not re-exported from `services/index.ts` — the extraction adds **0** names to `@massa-ai/core`'s published surface. ~~T3's suite passes unmodified~~ → **T3's suite's assertions pass unmodified; its comments do not, and that is this task's `+ N citation repoints` — added by C55 (§10.10).** It carries the largest share of the 48: the whole `:252-337` span this task moves. **It also carries the nine stale `:NNN` in `test()` TITLE strings that T8b deliberately left** (`:245`, `:260` ×2, `:300`, `:328`, `:365` ×2) — a string literal is not a comment, so T8b could not touch them without making *"comments only"* false; this task rewrites those tests anyway | 1 handler + 1 new module + 1 new suite **+ N citation repoints + 9 test-title repoints** | **GMS-02 AC-1**, RFS-03 AC-2 |

~~**Phase 3's four task rows sum to 16 and the phase is 13 distinct files**~~ → **amended at T11: the
rows sum to 12 + 17 + 8 + T12's, and §1's Phase-3 row (**29 so far**, still rising) is the figure to
read.** Both figures were written before C55 made each task re-derive its own citation count, and
neither survived first contact. What is unchanged and is the point: all four tasks edit
`read_file.ts`, which is the write set's only *structural* overlap. Each removes its own spans and
adds its own imports; a reviewer sizing per-task diffs must not count that file four times.

**Acceptance reading for Phase 3** (GMS-02 AC-1, not a gate): `read_file.ts` **707 → ≤ 125**,
maximal bodies **13 → 0**, `Map` fields **2 → 0**, `handle()` **175 → ≤ 120**, the six modules
present and imported, schema byte-identical. **Measured waypoints, so a resumer can tell progress
from completion**: after T9 `715 → 590`; after T10 `→ 392`, maximal `13 → 5`, `Map` **2 → 0**; after
T11 `→ 315`, maximal **→ 1**, raw **→ 1**, `handle()` **175 → 165** — the first movement in
`handle()` since T5, and the surviving body is C64's wiring arrow, which is T12's. **Below ~100 is also a failure** — 68 of the 125 is
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

| 16 | `design.md` §3.2 (*"`ReadFileTool` is constructed at **20 sites**"*) | **T9 (§10.11)** — measured **41** across **9** files, not 20 across 5: `read-file-containment.test.ts` 7, `read-file.test.ts` **9** (not 7), `wave-4-correctness.test.ts` 4, plus four files §3.2 predates — `read-file-presentation-characterization.test.ts` **9**, `read-file-containment-shapes.test.ts` **6**, `lru-eviction-characterization.test.ts` 2, `read-file-project-root-rename-pin.test.ts` 2 — and the 2 production sites. **True when written and falsified by PR-D's own Phase 0**, which is the same shape as C55: this feature's earlier tasks invalidating a figure in its own Design. The constraint §3.2 exists to state — that the constructor's arity and parameter type are public surface — is **strengthened**, not weakened, by the larger number |

| 17 | `design.md` §5.1 module 6 (`:455`) vs module 7 (`:456`) | **C66** (§10.13) — the table gives module 6 `calculateRange`, whose parameter is **`ReadFileParams`**, and gives `interface ReadFileParams` to **module 7**, which *composes* 2–6. As written module 6 imports from the module that composes it: a backward edge naming a type that does not exist until T12. §5.1's own note says the table *"is not the dependency graph"* and names **two** crossing edges (2 → 3, 4 → 5), handing the second to Tasks explicitly; **this is a third of the same shape and it was handed to nobody**, which is why §4's header could truthfully say §5.1 *"names one"*. Resolved at T11 by declaring `interface LineRangeRequest` — the four fields `calculateRange` reads — in module 6, which `ReadFileParams` satisfies structurally |

These are **T20b**. ~~Six~~ → ~~fourteen~~ → ~~fifteen~~ → ~~sixteen~~ → **seventeen** corrections;
the count in `HANDOFF.md` and `STATE.md` was last true at Design.

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
| *"inserting CAP+1 distinct keys evicts the oldest…"* | `:264-299` (describe `:257-300`) | `fileCache`, ~~`projectRootCache`~~, `evictOldest`, `FILE_CACHE_MAX_ENTRIES` | **T7** — `evictOldest` leaves the class | **T8** |
| *"undefined-metadata entry: first hit re-extracts + persists…"* | `:316-366` (describe `:302-367`) | `extractMetadata`, `fileCache` | **T10** — `extractMetadata` → module 5, `fileCache` → module 4 | **none** |
| **the two call-site sensors — added at T8 (C49)** | the new `describe` after the block above | `fileCache`, **`projectRootCache`**, `FILE_CACHE_MAX_ENTRIES` | **T9** for the `projectRootCache` one — module 3 takes both the Map and the `indexing:started` subscription; **T10** for the `fileCache` one | **T9** (**C53**, §10.9) |

**Two amendments to this table, both landed at T8.** `projectRootCache` is struck from row 1 by
**C51** (§10.8): the cast **declares** it and the body has **zero** references, so the row's
break-phase analysis never had to consider it — which is exactly why row 3's earlier break went
unseen until T8 made that reach live. And row 3 is new: **the moment T8 closes C49 it creates a
private reach that dies one task sooner than any row here predicted.** *A table of which tests break
when is falsified by the task that adds a test, not only by the task that moves a member.*

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

**Every line number in this table is PRE-T7 and the measurement it labels was taken POST-T7** — the
shipped-tree column was added at T8 (**C52**, §10.9), because T25's row requires re-running this
table on the real tree and the labels are off by one at all four sites:

| call site deleted | shipped tree | all six suites | only sensor |
| --- | --- | --- | --- |
| `read_file.ts:169` — `projectRootCache`, inside the `indexing:started` handler | **`:170`** | **92p/0f — NO SENSOR** | none |
| `read_file.ts:462` — `projectRootCache`, workspace lookup | **`:463`** | 91p/1f | T1's oracle, `read_file projectRootCache` case |
| `read_file.ts:570` — **`fileCache`** | **`:578`** | **92p/0f — NO SENSOR** | none |
| `symbol-graph.service.ts:792` | **`:793`** | 91p/1f | T1's oracle, `symbol-graph projectRootCache` case |

**Both `NO SENSOR` readings reproduce exactly on the shipped tree at T8** before any T8 edit, and
both flip to `93p/1f` after it — §10.9's before/after pair. The instrument itself was never wrong:
`t7-callsite-sensors.ts` anchors on **text**, not line numbers, so only its labels were stale.

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

~~T7's delegate is net **−3 lines** in `read_file.ts` (+1 import, −4 method body).~~ → **amended by
C52 (§10.9): net `+8`, `707 → 715`.** Measured through the gate's own `--json`, cell by cell:

| | before | after |
| --- | --- | --- |
| counts — maximal bodies / raw / state / `handle()` / members | 13 / 17 / 2 / 175 / 25 | **13 / 17 / 2 / 175 / 25 — identical** |
| spans moved | — | **15 of 15** |
| `index_project.ts` spans moved | — | **0 of 3** |

**Both rows of that table reproduce against the shipped tree** (T8 re-ran the gate's `--json`); only
the per-entry deltas below were taken on the probe's tree rather than the committed one.

Five entries shift **+1** (the import): both `ArrowFunction`s, `resolveFilePath`,
`checkPathContainment`, `getProjectRoot`, and both `Map` state sites `:145-146` → `:146-147`.
`evictOldest` itself goes **`:477-483` (7L) → ~~`:478-480`~~ → `:489-491` (3L)** — the only length
change. Seven shift ~~**−3**~~ → **`+8`**: `calculateRange` through `extractImports`.

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

### 10.9 T8 — executed, 2026-08-01

**GMS-05 AC-3 satisfied for `read-file.test.ts`, and C49 closed.** One file, three cases: the
eviction characterization repointed at `services/cache/lru-evict.ts`, plus the two call-site sensors
C49 found the repository had never had. **7p/34x → 9p/45x, 0 fail.** Two new plan defects
(**C52–C53**, the fifty-seventh and fifty-eighth).

**C49's closure is the before/after pair, not the green suite.** Same instrument
(`t7-callsite-sensors.ts` — text-anchored, so T7's stale labels never affected it), same six suites,
run immediately before and after the edit:

| call site (shipped tree) | before T8 | after T8 | killing case |
| --- | --- | --- | --- |
| `read_file.ts:170` — `projectRootCache`, `indexing:started` | **92p/0f — NO SENSOR** | **93p/1f** | new — *"one indexing:started past a full projectRootCache evicts"* |
| `read_file.ts:463` — `projectRootCache`, workspace lookup | 91p/1f | 93p/1f | T1's oracle |
| `read_file.ts:578` — **`fileCache`** | **92p/0f — NO SENSOR** | **93p/1f** | new — *"one real read past a full fileCache evicts"* |
| `symbol-graph.service.ts:793` | 91p/1f | 93p/1f | T1's oracle |

Control 92p/0f → 94p/0f. Killing cases read **by name**, never by count (C45's lesson). All four
sites now sensed; before T8 the repository sensed two.

#### C52 — the fifty-seventh plan defect: T7's span figures were measured on a tree that was never committed

C50 recorded the post-T7 span table from `t7-span-delta.ts`. That probe applies a **prospective
minimal delegate** — `+1` import and a `−5/+1` body swap, net **−3**. The **shipped** commit also
carries an 11-line docblock the probe never applied:

```
git show --stat ea59b04 -- packages/core/src/tools/read_file.ts
  1 file changed, 13 insertions(+), 5 deletions(-)          →  net +8,  707 → 715
```

Re-measured against the shipped tree through the gate's own `--json`:

| | C50 records | shipped |
| --- | --- | --- |
| net lines, `read_file.ts` | −3 | **+8** (`707 → 715`) |
| seven entries shift | −3 | **+8** |
| `evictOldest` | `:477-483` → `:478-480` | `:477-483` → **`:489-491`** |
| five entries shift `+1`; 15 of 15 moved; counts 13 / 17 / 2 / 175 / 25; `index_project.ts` 0 of 3 | — | **all four confirmed** |

**C50's headline is right and its arithmetic is not**, which is why it survived: the claim a verifier
checks first (*"15 of 15 move, every count holds"*) reproduces exactly. Three cells below it do not.

**Three consequences, and they are in three different artifacts.** (1) §3.3 and C50 itself, amended
above. (2) **C49's and C48's own tables** cite four call-site lines that are pre-T7 — `:169`, `:462`,
`:570`, `:792` — and **T25's row requires re-running C49's table on the real tree**, so a verifier
finds every label off by one; the shipped column was added above rather than the labels rewritten,
because the measurement was taken post-T7 and the frame is what was missing. (3) **Three source
comments T7 itself added cite line numbers in their own file and were falsified by the commit that
added them** — `read_file.ts:484`, `symbol-graph.service.ts:812`, `file-filter-cache.ts:151`.
**Decided by the user from four options: fold into T8b** (widening T8 to 4 files, a new T8c, and
record-only all rejected). `read_file.ts`'s is de-numbered rather than renumbered, because T10 deletes
`:578`'s call and a renumber would go stale a third time.

*C42, C39, C43, C50 and now C52 are one family, and C52 is the family applied to C50: **a correction
can inherit the defect it corrects.** C50 was itself the finding that "byte-identical" must say which
metric — and it stated its own replacement metric from an instrument whose tree differed from the
one that shipped. Sixth correction on this feature to inherit the defect it was correcting.*

**A figure withdrawn rather than shipped.** The author's first sweep classified a `:NNN` citation as
self-referential when no path appeared **earlier on the same line**, and reported **59** repo-wide.
The evidence-audit lens refuted it and estimated **~6**. A block-aware re-measurement returns **25**,
and spot-checking shows it still cannot decide a bare `:NNN` in a docblock that does not re-name its
subject. **Neither number is defensible and none is quoted.** What both parties reproduced
independently and exactly is the only figure anything depends on: **5 citations inside the four
T7-edited files, resolving to 3 comments in 3 files** — T8b's write set.

#### C53 — the fifty-eighth: closing C49 creates a private reach that dies one task before C34's table predicted

**Found by the red-team lens, confirmed against the artifacts rather than accepted on report.**
T8's new `indexing:started` sensor must observe `projectRootCache`, and the only channel is the cast.
But **T9's row moves `projectRootCache` *and* the `eventBus` subscription `:162-171` into module 3** —
and §1's overlap table schedules the only Phase-3 touch of `read-file.test.ts` at **T10** (C34's
repoint, for `extractMetadata` + `fileCache`). Measured: **no Phase-3 row names `read-file.test.ts`
except T10's.** So T9 as written lands a commit where the sensor T8 just added throws, §1.1's
per-phase-green obligation is false, and **no task owns the break** — C48's formulation verbatim.

**Resolution: T9's write set gains `+ 1 test repoint`.** Author level on **C34's own precedent**,
quoted: *"Recorded rather than put to the user because GMS-05 AC-3 already fixes the answer
(repointed, not weakened, not skipped); the only open question was which task carries one file."*
C34's table gains a third row, and row 1 loses `projectRootCache` to C51 in the same edit.

*C34 enumerated which tests break at which phase. It was correct when written and is falsified by a
task that **adds** a test rather than by one that moves a member — the break-phase table has to be
re-derived by whatever changes the reaching set, in either direction.*

#### The discrimination table, two columns

Scratch-copy backup with SHA-256 byte-identity asserted on restore for both touched files,
refuse-on-anchor-not-found, refuse-on-byte-identical, refuse-on-load-failure. **Never `git checkout`.**

**Choosing column B, re-chosen rather than inherited.** T7 shipped no new test, so its column B was
*"the suites that existed before PR-D"*. T8 **does** ship new cases, so that choice no longer names
the premise. T8 rests on **C49** — that the tree *as of T7* had no sensor for two of the five sites —
so column B is **the six eviction suites exactly as they stood at `HEAD`**, `read-file.test.ts` swapped
back to its committed content. Column A is the same six with T8 applied.

| # | mutation | A: with T8 | B: pre-T8 (`HEAD`) |
| --- | --- | --- | --- |
| M1a | **post-seed** repointed call passes `CAP`, not `CAP - 1` | FAIL 93p/1f | n/a — construct does not exist |
| M1b | **seed-loop** repointed call passes `CAP` — inert **by position** | PASS 94p/0f | n/a — construct does not exist |
| M2 | `read_file` `fileCache` call site deleted (`:578`) | FAIL 93p/1f | **PASS 92p/0f** |
| M3 | `read_file` `projectRootCache` call site deleted (`:170`) | FAIL 93p/1f | **PASS 92p/0f** |
| M4 | `read_file` `projectRootCache` call site deleted (`:463`) | FAIL 93p/1f | FAIL 91p/1f |
| M5 | `evictOldest` delegate body emptied | FAIL 91p/**3f** | FAIL 90p/2f |
| M6 | read-promotion removed in `readFileWithCache` | FAIL 93p/1f | FAIL 91p/1f |
| M7 | comment-only edit at the delegate (**inert control**) | PASS 94p/0f | PASS 92p/0f |

Expectation mismatches: **0**. Both controls hold at their own baselines (94p/0f, 92p/0f).
**Column B misses 2 of 5 applicable mutations, and they are exactly M2 and M3** — the two sites C49
named. That is T8's justification measured rather than argued.

**M1a and M1b are one mutation split in two, and the split is the finding.** The first run mutated
the **seed-loop** call and read `PASS 94p/0f`, which is indistinguishable from a repoint no test
guards. It is a **dead mutation**: the seed loop runs at sizes 0…511, so no bound ≥ 511 can evict
there, and only the post-seed call can cross the boundary. Re-anchored on the post-seed call it reads
`FAIL 93p/1f`. **T6's recorded lesson recurring — the verdict column cannot show a dead subject**, so
both positions are run and labelled rather than one being reported. The inertness is a property of
the case as it stood **before** T8 too; T8 neither introduced nor removed it.

**M5 kills three cases in column A and two in column B**, and the third is the new `fileCache`
sensor — the one difference the neuter can see that the pre-T8 tree could not.

#### Gates, all six plus both structural gates

`lint` exit **0**, and proven to bite **on T8's own file** rather than assumed: a duplicate
declaration appended to `read-file.test.ts` produced
`packages/core/src/__tests__/read-file.test.ts:477:7: error: Identifier \`dupProbeT8\` has already been declared`
and exit **1**; restored SHA-256-identical (`9d1664a8a03bd480…`), lint back to **0**. `type-check`
**6/6, 0 cached** (forced). `build` **5/5, 0 cached** (forced), cache bypass confirmed executing —
`cache bypass, force executing` for all five plus `✔ Generated Prisma Client (v7.8.0)`. `test` exit
**0**, **11/11 tasks**, **5 cached and all five are `:build`**, `[test-isolation] PASS: all 147
group(s)`. `test:scripts` exit **0**, **1114** pass / 0 fail across **49** files — T4b/T5/T6/T7's
figure unchanged, as it must be for a commit adding no `scripts/` test. `test:plugins` exit **0**,
**96** pass / 0 fail across 8 files.

**`check-core-layering` after `git add`: `PASS — 0 violation(s) across 969 tier-to-tier edges in 904
tracked files`.** Read it as **edges 969 → 969; files 904 → 904 — both unchanged.** T7 was the commit
where the edge count moved (965 → 969); T8's new import is in `packages/core/src/__tests__/`, which is
not a tier, so it adds **no** tier-to-tier edge. Recording `edgesExamined` rather than the pass bit is
RFS-03 AC-1, and *"unchanged"* is a reading only because the figure is one that can move.

**`check-tools-thin` after `git add`: counts byte-identical to T5's frozen base** — `2 of 30`, 224
members examined, `read_file.ts` at 13 / 17 / 2 / 175 and `index_project.ts` at 3 / 3 / 0 / 128, exit
**1**, the intended pre-Phase-5 state. T8 touches no file under `packages/core/src/tools/`, so the
population cannot have moved. **Spans still differ from T5's transcription — 15 of 15, per C50 as
corrected by C52 above** — and T8 does not change them.

#### The Plan Challenge gate on T8 — two modes, and one finding rewrote the plan before it was written

Mode selection reuses this feature's recorded route (`spec.md` §9.1, `design.md` §10). Per §10.7 gate
finding 10 and §10.8 gate finding 1, **neither lens ran while a harness was running**, and the
evidence-audit lens was handed C52's measurements to attack rather than asked to reproduce a tree.
`git status --porcelain` and the SHA-256 of every file both were pointed at were checked after each
returned: tree clean, all seven SHAs unchanged.

| # | mode | finding | disposition |
| --- | --- | --- | --- |
| 1 | red-team | T8's new `projectRootCache` sensor loses its subject at **T9**, not T10; T9's row names no test repoint and §1's overlap table schedules none | **CONFIRMED** against the artifacts, not on report. Became **C53** |
| 2 | red-team | the planned repoint onto a bare `Map` duplicates `lru-evict.test.ts:60`/`:70`/`:107` and severs the `ReadFileTool` link — a net loss dressed as a repoint | **CONFIRMED, and it changed the implementation.** Verified by reading T6's suite: `:60` *"names the survivors exactly"*, `:70` *"a promoted key survives"*, `:107` the parametrized `read_file (512)` pre/post agreement. The repoint shipped as an **operator swap in place** instead |
| 3 | red-team | the `:170` sensor is vacuous if the published `projectId` collides with a seeded key — the handler's `delete` alone frees the slot, so the assertion holds with or without the eviction call | **CONFIRMED as a live hazard, C45's shape exactly.** Fixed by construction: disjoint key namespaces (`seeded-root-N` vs a `fresh-project-…` id), the precondition asserted rather than assumed, and **both** sensors assert an **exact** size rather than `toBeLessThanOrEqual` — C50's own record of `file-filter-cache.test.ts:94`'s upper bound letting M4 walk through |
| 4 | red-team | `handle()` genuinely reaches `readFileWithCache` for an absolute temp path with no `projectId`; TTL cannot confound the sensor; the `CAP - 1` post-call bound is the correct predicate; no six-gate hazard | **ACCEPTED as confirmation**, and reported by the lens as a clean trace rather than omitted |
| 5 | evidence audit | claims A–E re-derived independently — the `+13/−5` decomposition, `707 → 715`, `evictOldest :489-491`, the seven `+8` shifts, all counts, `index_project.ts` 0 of 3, and all three source-comment rows | **CONFIRMED — every figure reproduced**, at per-member granularity, with the degenerate-key trap explicitly refused. Third clean evidence-audit pass on this feature |
| 6 | evidence audit | **C48's and C49's own tables carry four stale call-site citations** — the same root cause as C50, inside the section that discovered C50, and missed by the author's own audit of that section | **CONFIRMED and it widened C52.** Independently re-resolved against the shipped tree before acceptance. The tables gained a shipped-tree column rather than rewritten labels |
| 7 | evidence audit | the author's *"59 self-referential citations"* does not reproduce; true count nearer **6** | **CONFIRMED IN MECHANISM, REJECTED AS STATED — and the author's replacement is no better.** Per-line classification *is* wrong for multi-line docblocks. But block-aware re-measurement returns **25**, not 6 and not 59, and still cannot decide a bare `:NNN` in a block that does not re-name its subject. **Twentieth time on this feature a critic's mechanism held while its conclusion did not.** The figure is withdrawn as unmeasurable rather than replaced; nothing depends on it |

Running total: **fifty-eight** plan defects.

#### What T8 pins that no artifact named

1. **A correction can inherit the defect it corrects, at one remove.** C50 established that
   *"byte-identical"* must say which metric; it then stated its own replacement metric from a probe
   whose tree was not the shipped one (**C52**). The check that would have caught it is the one C50
   itself prescribes — re-run the instrument against the committed tree, not the patched one.
2. **A break-phase table is falsified by adding a test, not only by moving a member.** C34 enumerated
   which tests break when and was correct when written; T8 closing C49 created a private reach that
   dies at T9 (**C53**). Re-derive it whenever the reaching set changes in **either** direction.
3. **A repoint onto a more general subject can be a deletion.** Moving the eviction assertions onto a
   bare `Map` would have satisfied *"against the module"* while duplicating T6's suite and severing
   the only thing that made the case belong to `ReadFileTool` (gate finding 2). **Ask what the case
   asserts that its destination does not.**
4. **An inert mutation and an unguarded subject read identically, and position is enough to cause
   it.** The repointed case has two operator calls; only the post-seed one can cross the bound
   (M1a/M1b). T6 recorded this for a dead *anchor*; here the anchor resolved and the **call position**
   made it inert.
5. **A stale label does not imply a stale instrument.** All four of C49's call-site line numbers were
   wrong and its measurement was exactly right, because `t7-callsite-sensors.ts` anchors on text.
   **Correct the frame, not the reading.**

### 10.10 T8b — executed, 2026-08-01

**RFS-02 AC-4 closes and C52 closes. Phase 2 is complete.** The write set grew from **5 comment
sites to 8 source files plus `spec.md`** on a user decision taken during the task, because T8b's own
charter — correcting comments that state something false — surfaced a strictly larger instance of
the defect it was created to fix. **Three new plan defects (C54–C56, the fifty-ninth to sixty-first),
running total sixty-one**, and C56 amends two criteria rather than a figure. No behavior changed: all
eight source diffs are **proven** comment-only.

**The five sites the row named, all measured stale on the shipped tree before being touched:**

| site | was | now | treatment |
| --- | --- | --- | --- |
| `production-wiring.ts:67-69` | *"both are TTL-bounded and self-evict (see invalidator-registry.ts)"* | what T1's pin measured | rewritten, **`:67-78`** |
| `invalidator-registry.ts:34-36` | *"both are TTL-bounded, so a stale entry self-evicts"* | same, and it no longer serves as the other site's authority | rewritten, **`:34-42`** |
| `read_file.ts:484` | `inlined at :169, :462 and :570` | `inlined at its three call sites, left unnumbered because Phase 3 moves one` | **de-numbered**, and **line-neutral** |
| `symbol-graph.service.ts:812` | `(:792)` | **`(:793)`** | renumbered |
| `file-filter-cache.ts:151` | `:51-53` | **`:52-54`** | renumbered |

**C35's structural half is closed, not just its text.** `production-wiring.ts` cited
`invalidator-registry.ts` as the authority for a claim that was false in both places. The
replacement cites **the pin test** — `__tests__/read-file-project-root-rename-pin.test.ts` — at both
sites. *A comment's authority should be a measurement, not another comment.*

#### C54 — the fifty-ninth: C52's sweep was self-referential, and the population is a strict superset

C52 measured *"5 citations inside the four T7-edited files → 3 comments in 3 files"* and withdrew any
repo-wide figure as unmeasurable. Both halves are right and the scoping is not: **T7's `+1` import
insertions falsify a citation *into* those files no matter which file the citation lives in.**
Measured over all **892** tracked source files (`.specs/` excluded):

| population | count | note |
| --- | --- | --- |
| self-referential — C52's | **5** in 3 blocks / 3 files | reproduced exactly, twice, independently |
| explicit `<t7-file>:NNN` living **elsewhere** | **14**, all 14 textually stale | outside C52's sweep entirely |
| bare `:NNN` in the three Phase-0 suites | **~35 more** | subject inherited from the docblock |
| stale citations, three Phase-0 suites, comment lines | **48**, of which **44** point into a span Phase 3 relocates | census |

**Two figures the author stated and the evidence-audit lens corrected, both kept at the audited
value.** *"13 stale"* was narrated against an instrument that printed **14** — the definition given
(*"pre-T7 text differs from shipped text"*) admits `active-generation.ts:20`, which C4 separately and
correctly argues is not a degradation; **14 textually stale, 13 degrading** is the honest pair. And
*"10 of 13 land in a Phase-3 span"* was a hand count against a span table missing the **field
declarations** T9 and T10 take by identifier rather than by span (`fileCache`, `projectRootCache`,
`CACHE_TTL`, `ROOT_CACHE_TTL`, `FILE_CACHE_MAX_ENTRIES`); corrected, **11 of 13**, and the census
moved 43 → **44 of 48**. *Neither correction changes a conclusion and both change a number — which is
the reason to run the lens at all.*

**Three of them do not merely dangle, they invert** — the shipped line at the cited number contradicts
the sentence citing it, which is strictly worse than the three C52 sites, where a stale number lands
on an adjacent line:

| citation | claims | shipped line at that number |
| --- | --- | --- |
| `read-file-project-root-rename-pin.test.ts:8` | `read_file.ts:148` declares `ROOT_CACHE_TTL` and **NOTHING READS IT** | `private readonly CACHE_TTL = 60000;` — the constant that **is** read |
| `…:174` | `// read_file.ts:148, read nowhere` | same inversion |
| `…:173` | `// read_file.ts:147, read at :544` | `:147` is the `projectRootCache` **Map**; `:544` is `includeSymbols: …` |

**Decided by the user from four options: fix all now, widening T8b to 8 files.** Assigning them to
the Phase-3 tasks that move each span, de-numbering all of them, and record-only were rejected. The
cost the option carries was stated before it was chosen and is real: the three Phase-0 suites are
re-baselined mid-Phase-2, so `§10.8`'s SHA table no longer describes them, and **44 of 48 will be
falsified again at Phase 3** — see **C55**.

*C48 said a decision recorded against the file that provoked it is not thereby recorded against the
class it belongs to. **C54 is that sentence applied to a sweep**: a population scoped to the files a
commit touched is not the population of citations that commit falsified.*

#### C55 — the sixtieth: Phase 3 re-falsifies what T8b just fixed, and no row owns it

Fixing the citations now does not retire the obligation, it moves it. **44 of the 48** name spans
that T9, T10, T11 and T12 relocate into `services/file-read/`, after which they will name a file that
no longer contains the code. Measured against `tasks.md` §5's Phase-3 rows: **no row names any of the
three Phase-0 suites**, and T9's only test entry is C53's `read-file.test.ts` repoint.
C48's *"a break owned by nothing"* verbatim, third occurrence.

**Resolution: T9, T10, T11 and T12 each gain `+ N citation repoints`** for the suites whose citations
name the spans that task moves. ***Extended by C62 (§10.12): the rule has a null case.*** A citation a
task SHIFTS whose subject **no remaining task moves** is owned by nobody under this rule and under
C59's; measured, there is exactly one, and it belongs to the task that shifts it. Author level, because the user's own C54 decision fixes the policy
(*repointed, now, not deferred*) and the only open question is which task carries which file — C53's
precedent exactly. The counts are per-task and re-derived at each task, not inherited from here:
**a task that moves a span must re-run the sweep, because the reaching set moves in both directions**
(C53's own lesson).

**Nine `:NNN` citations are deliberately NOT fixed and are T12's.** They sit in `test()` **title
strings**, not comments — `read-file-presentation-characterization.test.ts:245`, `:260` ×2, `:300`,
`:328`, `:365` ×2, plus two `:00` false hits from a date literal at `read-file-project-root-rename-pin.test.ts:172`.
Editing a string literal changes the token stream and would make *"comments only"* false, which is
the property the user preserved when C52 chose this row. They are stale and recorded as stale.

#### What was measured, and what proves it

**The repoint is content-anchored, never arithmetic.** For each cited pre-T7 number the instrument
reads the **text** at that line in `ea59b04^` and locates that exact text on the shipped tree.
Deriving *"+1 below the import, +8 below `:474`"* is the class of arithmetic that produced C50 and
then C52; a unique text match cannot drift. Verified by a round trip that is **not** the proposal
generator re-run — for every pair it asserts `pre-T7[old] === shipped[new]`:

```
PASS — 49 citation pair(s) checked by content, 0 mismatch,
       274 comment line(s) deliberately unchanged, 8 foreign citations skipped by name
```

**Four adjudications a regex cannot make**, written into the instrument with their reason rather than
skipped silently: `presentation:21` (`:556`), `:27` (`:676`), `:30` (`:652-668`) all inherit
`e2e/08.search.test.ts` as their subject, and `:49` (`:11`, `:23`) inherits
`apps/tools-api/src/routes/file.test.ts` from four lines earlier. **All four were left untouched**;
renumbering them against `read_file.ts` is precisely `t8-cite-population.ts`'s recorded
cross-contamination defect.

**Comment-only is proven, not asserted.** Both revisions of all eight files are parsed and printed
with `removeComments: true`; identical output means the only difference was trivia.

| file | code lines | source lines | verdict |
| --- | --- | --- | --- |
| `read_file.ts` | 493 → 493 | **715 → 715, delta 0** | COMMENT-ONLY |
| `symbol-graph.service.ts` | 507 → 507 | 830 → 830 | COMMENT-ONLY |
| `file-filter-cache.ts` | 129 → 129 | 234 → 234 | COMMENT-ONLY |
| `production-wiring.ts` | 78 → 78 | 132 → **141** | COMMENT-ONLY |
| `invalidator-registry.ts` | 74 → 74 | 101 → **107** | COMMENT-ONLY |
| the three Phase-0 suites | unchanged | unchanged | COMMENT-ONLY |

**`read_file.ts`'s zero line delta is a design constraint, not luck.** The gate's spans are
declaration-only (§3.3), so `evictOldest`'s own `:489-491` is unaffected by its docblock — but the
**eight** members below it are not, and the frozen base has already been re-derived once at T7 for
exactly this reason (C50, as corrected by C52). The de-numbered sentence was therefore written as
**four lines replacing four**, absorbing *"left unnumbered because Phase 3 moves one"* by tightening
the two sentences that follow it. A fifth line would have moved fifteen spans a second time.

#### The two prose sites grew, and that falsified two citations in `spec.md`

Found by the red-team lens **before** the edit was written. An honest correction needs ~6 lines, not
3. Measured blast radius of the growth — **20** citations of `production-wiring.ts` repo-wide:

| zone | count | consequence |
| --- | --- | --- |
| above `:67` | 8 | unaffected |
| inside `:67-69` | 10 | all cite `:67-68`, which still lands inside the corrected comment |
| **below `:69`** | **2** | **shift onto different code** |

The two are `spec.md:156` → `production-wiring.ts:105` (`symbolGraph.clearProjectRoot`) and
`spec.md:158` → `:91` (`fileFilterCache.invalidateProject`) — both exactly right beforehand, both in
**§3.B's own evidence table**, the table RFS-02 AC-4 rests on. Re-measured by content after the edit:
**`:91` → `:100`, `:105` → `:114`**, and both amended in place in `spec.md`. **Decided by the user
from four options**; de-numbering them, constraining the correction to three lines, and deferring to
T20/T25 were rejected. The repoint is stable: `production-wiring.ts` appears in **no** Phase 3–7
write set. `invalidator-registry.ts` has **0** citations below its edit and needed none.

*A comment-only diff moves no tokens and still moves line numbers, and line numbers are load-bearing
in this feature's own record. "Comments only" is a claim about the AST, not about the document.*

#### Gates, all six plus both structural gates

`lint` exit **0**, and proven to bite **on a T8b file** rather than assumed: a duplicate declaration
appended to `read-file-presentation-characterization.test.ts` produced
`…:412:7: error: Identifier \`dupProbeT8b\` has already been declared` and exit **1**; restored
SHA-256-identical (`bfb23fdc1d05f5e7…`), lint back to **0**. `type-check` **6/6, 0 cached** (forced).
`build` **5/5, 0 cached** (forced), 5 `cache bypass, force executing` lines and Prisma generated.
`test` exit **0**, **11/11 tasks**, **5 cached and all five are `:build`** — every one of the 6
`:test` tasks executed — `[test-isolation] PASS: all 147 group(s)`, clean on the **first** run.
`test:scripts` exit **0**, **1114** pass / 0 fail across **49** files, unchanged as it must be for a
commit adding no `scripts/` test. `test:plugins` exit **0**, **96** pass / 0 fail across 8 files.
The three Phase-0 suites plus both eviction suites run together: **37 pass / 0 fail / 3258 expect()
in 302 ms** under an empty `XDG_CONFIG_HOME`.

**`check-core-layering` after `git add`: `PASS — 0 violation(s) across 969 tier-to-tier edges in 904
tracked files`.** Read it as **edges 969 → 969; files 904 → 904 — both unchanged.** T7 was the commit
that moved the edge count (965 → 969); T8b changes no import at all, so the figure could not move —
and *"unchanged"* is a reading only because it is a figure that can move (RFS-03 AC-1).

**`check-tools-thin` after `git add`: byte-identical to the pre-edit run** — the whole report, not
its summary line. `2 of 30`, 224 members, `read_file.ts` 13 / 17 / 2 / 175 with all 15 spans
unmoved, `index_project.ts` 3 / 3 / 0 / 128, exit **1**, the intended pre-Phase-5 state. **This is a
strictly stronger claim than T7's and T8's**, which held the counts while 15 of 15 spans moved
(C50/C52). It is available only because the `read_file.ts` edit was made line-neutral on purpose.

#### The Plan Challenge gate on T8b — two modes, and the gate rewrote the write set

Mode selection reuses this feature's recorded route (`spec.md` §9.1, `design.md` §10). Per §10.7 gate
finding 10 and §10.8 gate finding 1, **no harness ran while either lens was live**, and both were
handed measurements to attack rather than asked to reproduce a tree. `git status --porcelain` and the
SHA-256 of all six files they were pointed at were checked after each returned: **tree clean, all six
SHAs unchanged**.

| # | mode | finding | disposition |
| --- | --- | --- | --- |
| 1 | red-team | correcting `production-wiring.ts:67-69` honestly cannot stay 3 lines, and ≥1 line of growth silently staleds citations **below** the edit | **CONFIRMED, and it changed the write set.** Re-measured independently: 20 citations, 2 below, both in `spec.md` §3.B, both exact beforehand. Became the second user decision |
| 2 | red-team | the de-number at `read_file.ts:484` has **no stated line-count requirement**, and a reflow moves 8 member spans a second time with nothing watching | **CONFIRMED.** The token-identity proof is comment-blind **by design** and would have passed a line-count change. The edit was written 4-lines-for-4 and `check-tools-thin` diffed byte-for-byte instead of by counts |
| 3 | red-team | none of the four planned verification layers can detect findings 1–2; no test in `packages/core/src/__tests__` asserts a literal source line number | **CONFIRMED as a structural gap.** Closed by adding the citation sweep and the byte-diff of the gate report to the recipe |
| 4 | red-team | sites 4 and 5's *"plain renumber is stable"* justification, the `13→12 / 224→223` counterfactual, and the quoted gate baselines all verified against the tree | **ACCEPTED as confirmation**, reported rather than omitted |
| 5 | evidence audit | claim sets A, B, C1, C3, C4, D1, D2, D3 — every figure re-derived independently, including running the pin suite live (**2 pass / 23 expect()**) to confirm all four sub-claims the corrected comments assert | **CONFIRMED — all reproduce.** Fourth clean evidence-audit pass on this feature |
| 6 | evidence audit | *"13 stale"* does not reproduce under its own stated definition — measured **14** | **CONFIRMED, author corrected.** Folded into C54 |
| 7 | evidence audit | *"10 of 13 land in a Phase-3 span"* does not reproduce — measured **11** by occurrence; the author's span table omitted the field declarations T9/T10 take by identifier | **CONFIRMED, author corrected**, and the census moved 43 → 44 of 48. Folded into C54 |

**Twenty-first and twenty-second time a critic's mechanism held while a figure did not — except this
time both figures were the author's and both critics were right.** Findings 6 and 7 are the first on
this feature where the evidence-audit lens corrected a number and the correction survived
re-measurement unchanged.

#### What T8b pins that no artifact named

1. **A population scoped to the files a commit touched is not the population that commit falsified**
   (C54). C52 swept self-referential citations because the defect was found in a self-referential
   one. The superset had to be found by asking what the commit *moved*, not what it *edited*.
2. **"Comments only" is a claim about the AST and says nothing about line numbers.** Two of the eight
   files grew, and in this feature a line number is load-bearing evidence. The prover reports the
   line delta beside the verdict for exactly this reason.
3. **A checker that passes one observed red can still be unsound.** The comment-only prover first
   drove a raw `ts.createScanner`, which cannot re-scan template spans without a parser; at the first
   backtick in `read_file.ts` it swallowed the file's remainder into one "token" **including the
   comments it was meant to be blind to**, and reported NOT COMMENT-ONLY for a comment-only diff. It
   had passed its red test earlier only because that diff differed before reaching a template
   literal. **A red proves the checker can fire, not that it fires for the right reason.**
4. **A verifier that only inspects the diff cannot see an omission.** The round-trip checker skipped
   unchanged lines; a probe reverting one citation to its stale value made the line equal to `HEAD`
   and read **PASS**. Correctness of what moved and completeness over what did not are two properties
   — the fix was to pair an unchanged line as `N → N`, where the same content assertion becomes
   exactly *"this line needed no change"*. **T6's and T8's inert-mutation lesson, now in the
   instrument rather than the subject.**
5. **Three instrument defects in one task, all found by something other than a green run** — the
   scanner above, the `/g` `RegExp.test` whose `lastIndex` silently skipped lines, and a `\b`-anchored
   negative lookahead that matched mid-token and classified `-graph.service.ts:174` as a foreign file.
   Each produced a confident wrong answer about a correct edit. *When the instrument and the edit
   disagree, neither is presumed right.*

#### C56 — the sixty-first: C55 falsifies RFS-02 AC-1's byte-identity clause by construction

**Found by following C55's own consequence rather than by a critic.** RFS-02 AC-1 requires T1's two
suites to *"pass unmodified after [the extraction] — byte-identity of the test files asserted across
the move"*, and RFS-06 AC-1 says the same of T2's. **C55 requires T9, T10, T11 and T12 to edit those
suites' comments**, because they move the `read_file.ts` spans the comments name. The two cannot both
hold, and the conflict is created by a decision taken at T8b rather than discovered at T9.

**Amended in place at both criteria, at author level, and handed to T25 as a question** alongside
C37's, C41's, C48's and AC-2's. The replacement is **byte-identity with comments stripped**, which is
the property AC-1's own sentence says it is for — *"not 'the tests are green now'"*, i.e. that no
assertion was weakened to accommodate the move. A comment-only diff cannot weaken an assertion, and
the predicate is now the one this task already ships an instrument for, with an observed red.

~~**Note what does NOT change.** `lru-eviction-characterization.test.ts` — T1's other file, and AC-1's
main subject — carries **zero** `read_file.ts` line citations and is byte-identical through T8b. The
narrowing is needed for the three suites that cite line numbers, not for the oracle.~~
→ **amended by C58 (§10.11): the premise holds and the conclusion does not.** The oracle carries zero
*line* citations and **two by-FILE claims** — `:28`'s site-table row `| read_file.ts · projectRootCache |`
and `:178`'s `// Site 2 — tools/read_file.ts · projectRootCache` — both of which **T9 relocates**, so
it is edited at T9 after all. **The amendment above is what makes that legal**; only this note is
wrong. The narrowing was needed for the oracle too, and for the same reason. *A note asserting that
something does not change is a claim about a population, and this one was scoped to the metric the
sentence beside it happened to measure.*

*The rule this feature already recorded, applied to itself: a spec that contradicts a structural
requirement loses the clause, and the amendment names the reason and goes to the verifier as a
question rather than being satisfied quietly.*

**Running total: sixty-one plan defects.**

### 10.11 T9 — executed, 2026-08-02

**RFS-06 AC-1 closes, GMS-05 AC-3 is satisfied for the C53 repoint, and Phase 3 is open.** Modules 2
and 3 are extracted: `services/file-read/path-containment.ts` (`resolveFilePath` +
`checkPathContainment`) and `services/file-read/project-root-cache.ts` (`getProjectRoot` +
`projectRootCache` + `ROOT_CACHE_TTL` + the `eventBus` subscription). **Three new plan defects
(C57–C59, the sixty-second to sixty-fourth), running total sixty-four.** The write set grew from 8
files to **12** on a user decision taken during the task.

#### The spans, AST-derived and anchor-verified — none of them is what the row cites

§5's T9 row is **pre-T7** numbering throughout. Every span below was derived from the TypeScript AST
(declaration span + `getLeadingCommentRanges`) and cross-checked against a required anchor string on
its declaration line; a mismatch throws rather than reports.

| member | row cites | shipped decl | shipped with comments | dest |
| --- | --- | --- | --- | --- |
| `projectRootCache` | by identifier | `:147` | `:147` | module 3 |
| `ROOT_CACHE_TTL` | by identifier | `:149` | `:149` | module 3 |
| `eventBus.subscribe("indexing:started")` | `:162-171` | `:168-172` | `:163-172` | module 3 |
| `resolveFilePath` | `:350-385` | `:369-386` | `:351-386` | module 2 |
| `checkPathContainment` | `:387-448` | `:408-449` | `:388-449` | module 2 |
| `getProjectRoot` | `:450-470` | `:451-471` | `:451-471` | module 3 |

**88L declaration-only / 131L comment-inclusive.** The 2→3 edge is confirmed by content, not
arithmetic: `getProjectRoot` is called at shipped `:374` and `:416`; the row cites `:373`/`:415`.
`read_file.ts` **715 → 590**.

**The code moved verbatim; exactly one docblock did not, and it is recorded rather than glossed.**
`resolveFilePath`'s comment carried two malformed lines — a bare ` relative` with **no comment
prefix** at `:360` and a stub `   *    the` at `:362`. Module 2 reflows that passage across five
lines with **identical prose**; nothing else in either module differs from the source by a character.

#### Two decisions taken at author level, both recorded with their rejected option

1. **Module 3 is instantiated PER `ReadFileTool`, never a module singleton.** Each tool owned its own
   Map before the move — measured **41** construction sites across 9 files, not `design.md` §3.2's
   **20**, which was true when written and falsified by PR-D's own Phase 0 (owed to `design.md`,
   §8.1 row 16). A shared instance leaks cached roots between independently-constructed tools;
   mutation **M10** confirms the repository sees the difference.
2. **Module 2 takes module 3 as a constructor dependency, not a `getProjectRoot` callback.**
   *Rejected: the callback shape §4.1 and §4.2 chose.* The red-team lens was right that the plan's
   first framing — *"that is `design.md` §5.1's own decision"* — **overstates the artifact**: §5.1
   names the 2→3 edge and its direction and chooses **no mechanism**, and `tasks.md` §4's own header
   says §5.1 *"names **one**"*, the 4→5 edge. So this is a real decision and it is taken here rather
   than inherited. The callback exists in §4.1/§4.2 to stop a module **naming** a heavy collaborator
   (`SymbolGraphService`, `ContextualSearchRLM`); module 3 is neither heavy nor DB-bound, module 3
   caches so neither shape adds a lookup, and the direct edge is the one §5.1 describes.

#### C57 — the sixty-second: the sweep's shape, not its count, is what kept going stale

C54 widened the **explicit** `<file>:NNN` sweep to all 892 tracked source files and **left its
sibling hand-scoped**: `t8b-phase0-citation-census.ts` reads bare `:NNN` from a hard-coded
`CARRIERS` array of three Phase-0 suites, and **no sweep on this feature has ever looked at by-FILE
or by-IDENTIFIER claims at all**. Measured by patching the subject predicate and diffing the counts,
because a widening that cannot match is a no-op and reads identically to a clean sweep:

| bare-`:NNN` subject rule | subject files | bare citations | in a T9 span |
| --- | --- | --- | --- |
| header (first 40 lines) names `read_file.ts` — **T8b's rule** | 7 | 39 | **3** in 1 file |
| `read_file.ts` anywhere in the file | 10 | 43 | **5** in 3 files |
| `read_file.ts` **or** `ReadFileTool` anywhere | 20 | 43 | **5** in 3 files |

**Not a no-op**: rule 2 finds two more, and rule 3 adds 10 subject files and 0 citations, so the
population is saturated at rule 2. Four measured instances:

1. **`scripts/check-tools-thin.ts:103` — the gate's own docblock**, reading *"the `eventBus.subscribe`
   arrow at `:167-171`"*. Content-anchored across three revisions: at `ea59b04^` those lines **are**
   the arrow; at `ea59b04` and at `HEAD` the arrow is `:168-172` and `:167` is a comment. The gate was
   authored at `180f7d2`, which precedes `ea59b04` — **correct when written, falsified by T7, missed
   by T8b.**
2. **Six by-file / by-identifier claims** naming `read_file.ts` as the home of a member T9 relocates,
   in `lru-eviction-characterization.test.ts` ×2, `lru-evict.ts`, `check-tools-thin.test.ts`, and the
   pin suite ×2.
3. **Two citations INTO `read-file.test.ts`** — T8 rewrote that file and swept only citations into
   `read_file.ts`. `lru-eviction-characterization.test.ts:16` is the worse of the two: it names the
   four private members the cited test reaches, and **T8's own repoint narrowed that cast to two**.
4. **One semantic inversion**: the pin suite's `:17` cites `production-wiring.ts:67-68` as *giving*
   the reason *"both are TTL-bounded and self-evict"* — a claim that comment now explicitly
   **disavows**, because T8b rewrote it. T8b swept citations into that file for line-number staleness
   (correctly concluding the numbers still land inside the block) and not for meaning.

*C54 said a population scoped to the files a commit touched is not the population it falsified.
**C57 is that sentence applied to the instrument rather than to the commit**: fixing one sweep's
scope says nothing about its sibling's, and neither sweep had a by-identifier half at all.*

#### C58 — the sixty-third: C56's "Note what does NOT change" is falsified by T9

C56 narrowed RFS-02 AC-1 and RFS-06 AC-1 to **byte-identity with comments stripped**, then recorded:
*"`lru-eviction-characterization.test.ts` — T1's other file, and AC-1's main subject — carries **zero**
`read_file.ts` line citations and is byte-identical through T8b. The narrowing is needed for the three
suites that cite line numbers, not for the oracle."*

**The premise is exactly right and the conclusion does not follow.** The oracle carries zero *line*
citations and two *by-file* claims — `:28`'s site table row `| read_file.ts · projectRootCache |` and
`:178`'s `// Site 2 — tools/read_file.ts · projectRootCache` — both of which T9 relocates. So the
oracle **is** edited at T9, and C56's amended predicate is what makes that legal. **The amendment
covers it; only the note does not.** Amended in place at §10.10.

*Third correction on this feature to be right about the metric it measured and silently false about
the neighbouring one — C39, C42, C43, C50, C52's family, now reaching a "what does not change" note.*

#### C59 — the sixty-fourth: a task falsifies more citations than it moves, and C55 assigns only the moved

C55 gives each Phase-3 task *"+ N citation repoints for the suites whose citations name the spans
**that task moves**"*. T9 moves 6 spans and **removes 122 lines**, so every citation naming code
below them is falsified too. Measured on the shipped tree, content-anchored:

| class | count | owner |
| --- | --- | --- |
| **MOVED-OUT** — subject left the file | **21 sites in 7 files** | **T9's, and discharged** |
| **SHIFTED** — subject still in `read_file.ts`, at a new number | **27** | the task that moves the subject (C55) |
| ambiguous — cited text now occurs 2–3× | **9** | same, needs per-case adjudication |
| stable / blank | 5 | — |

**Every one of the 27 names code T10, T11 or T12 relocates** (`:251-336` is T12's, `:518-580` and
`:645-681` T10's, `:630-643` T11's), so renumbering them at T9 buys a third falsification — T8b's own
reason for **de-numbering** `read_file.ts:484` rather than renumbering it. Resolved at author level by
following C55 as written: the owning task's edit fixes shift and move in one pass and nothing is lost.
**Recorded with its measured size because a verifier re-running the sweep after T9 will see 27 stale
citations and must be able to tell a scheduled transient from a defect.** ~~Post-repoint the sweep reads
**moved-out 0**.~~ → **amended by C61 (§10.12): the true post-repoint figure is `moved-out` 1, and the
population is 45 rather than 43.** `read-file-containment-shapes.test.ts:231` carried two bare
citations this sweep could not see, because T9's own repoint of that file's other citations took its
literal `read_file.ts` count **5 -> 0** and dropped it out of the population the sweep read.

#### The discrimination table, two columns

Scratch-copy backup, SHA-256 byte-identity asserted on restore, refuse-on-anchor-not-found,
refuse-on-byte-identical, refuse-on-load-failure. **Never `git checkout`.**

**Choosing column B, re-chosen rather than inherited.** T7's was *"the suites that existed before
PR-D"*; T8's was *"the six eviction suites as they stood at `HEAD`"*. Neither names T9's premise. T9
ships **two new module suites that DEBT-02's per-file floor forces into existence** (R-36), and R-26
warns that a forced coverage gate is precisely how shallow tests get written. So column B is **the
pre-existing suites with only the C53 repoint applied** — what the repository would still catch if T9
had extracted and repointed but written no new tests. That measures whether the two new files
**discriminate** or merely **cover**.

| # | mutation | A: with T9's new suites | B: pre-existing only |
| --- | --- | --- | --- |
| M1 | containment: `rel.startsWith("..")` narrowed to `"../"` — RFS-06 shape (a) | FAIL 68p/3f | FAIL 42p/2f |
| M2 | env allowlist hoisted from call time to construction time — shape (b) | FAIL 68p/3f | FAIL 43p/1f |
| M3 | `sanitizeFilePath` dropped from the projectId branch — shape (c) | FAIL 69p/2f | FAIL 43p/1f |
| M4 | the project root is never added to the allowed roots | FAIL 58p/13f | FAIL 35p/9f |
| M5 | teaching error also enumerates the host home directory — RFS-06 AC-2 | FAIL 68p/3f | FAIL 43p/1f |
| M6 | cap 512 → 256 | FAIL 69p/2f | FAIL 43p/1f |
| M7 | eviction call deleted in the `indexing:started` subscription | FAIL 69p/2f | FAIL 43p/1f |
| M8 | eviction call deleted in `getProjectRoot` | FAIL 69p/2f | FAIL 43p/1f |
| M9 | read-promotion (delete+set) removed from the hit path | FAIL 69p/2f | FAIL 43p/1f |
| M10 | one module-level `ProjectRootCache` shared across instances — **the rejected design** | FAIL 69p/2f | FAIL 42p/2f |
| M12 | `getProjectRoot`'s workspace-lookup catch RETHROWS instead of returning null | FAIL 70p/1f | **PASS 44p/0f** |
| M13 | a workspace with no `project_path` is cached anyway | FAIL 70p/1f | **PASS 44p/0f** |
| M11 | comment-only edit in `path-containment.ts` — **inert control** | PASS 71p/0f | PASS 44p/0f |

Baselines **A 71p/0f, B 44p/0f**; post-restore control **71p/0f, matches baseline**. Expectation
mismatches **0**. Killing cases read **by name**, never by count.

**The result a resumer should carry forward: column B misses 2 of 12, and which 2 is the whole
justification for the two new files.** Ten of the twelve mutations are already caught by the
handler-level suites — so on the extraction's main risk surface the new suites add **coverage, not
discrimination**, which is R-26's concern measured rather than assumed. The two they alone catch are
both `getProjectRoot` **failure branches**: every pre-existing suite stubs `getWorkspace` to return a
good path, so a throwing lookup and a `project_path`-less workspace are unreachable from `handle()`
by construction. *A module suite earns its place at the branches its callers cannot reach, and on
this module that is exactly two of thirteen.*

#### Gates, all six plus both structural gates

`lint` exit **0**, proven to bite **on a T9 file**: a duplicate declaration appended to
`project-root-cache.ts` produced `…:81:7: error: Identifier dupProbeT9 has already been declared`
and exit **1**; restored SHA-256-identical (`b9f02a5d8cf8db24…`), lint back to **0**. `type-check`
**6/6, 0 cached** (forced). `build` **5/5, 0 cached** (forced), 5 `cache bypass, force executing`
lines. `test:scripts` exit **0**, **1114** pass / 0 fail across **49** files — unchanged, as it must
be for a commit adding no `scripts/` test. `test:plugins` exit **0**, **96** pass / 0 fail across 8.

**`check-core-layering` after `git add`: `PASS — 0 violation(s) across 973 tier-to-tier edges in 908
tracked files`.** Read it as **edges 969 → 973 (+4); files 904 → 908 (+4)**. The +4 edges are
`path-containment → project-root-cache` plus module 3's three (`lru-evict`, `event-bus`,
`workspace-manager`); `read_file.ts`'s own count is **unchanged** — it gained two `tools → services`
edges to `file-read/` and lost the two to `event-bus` and `workspace-manager` that moved down with
the code. **RFS-03 AC-2 holds**: neither new module imports anything under `tools/`.

**`check-tools-thin` after `git add`: `FAIL — 2 of 30 … 221 members examined`, exit 1.** The verdict
`2 of 30` **holds**, which is the required reading — a drop to `1 of 30` would mean `read_file.ts`
went green four phases early. Members examined **224 → 221**. `read_file.ts` moves from
**13 / 17 / 2 / 175** to **9 / 10 / 1 / 175**: four maximal bodies leave (the three methods plus the
constructor-exempt `eventBus.subscribe` arrow) along with the three nested `.map`/`.filter` callbacks
inside `checkPathContainment`, and `handle()` is **unchanged at 175** because both call sites stay
one line. **§3.1's guarantee that the population is unchanged *between T5 and T9* expires here by
design** — T9 is the first extraction commit.

**Coverage on the two new modules, measured directly (R-36): both 100% funcs / 100% lines.**

**`bun run test` exited 1 on its first run and it is not T9's.** The failing case is
`apps/mcp-client` `embedded-api-client-endpoints.test.ts` → *"POST web/fetch_and_index"* at
**22031 ms** — the class `CLAUDE.md` documents for that exact file. Measured rather than waved off:
`apps/mcp-client/` is **zero-diff against `main`**; the file names none of `read_file`,
`ReadFileTool`, `file-read`, `path-containment` or `project-root-cache`; and run standalone it is
**95 pass / 0 fail under BOTH configs** — **3.96 s** under an empty `XDG_CONFIG_HOME` against
**17.82 s** under this machine's real one, a 4.5× penalty from the live provider the real config
enables. **Warm aggregate: 11/11 tasks, exit 0, 5 cached and all five are `:build`** — every one of
the 6 `:test` tasks executed — core `[test-isolation] PASS: all 149 group(s)` (147 → 149, the two new
suites). Both readings are recorded rather than only the green one.

#### The Plan Challenge gate on T9 — two modes, and the red-team rewrote the write set again

Mode selection reuses this feature's recorded route (`spec.md` §9.1, `design.md` §10). Per §10.7
finding 10 and §10.8 finding 1, **no harness ran while either lens was live**, and both were handed
measurements to attack rather than asked to reproduce a tree. `git status --porcelain` and the SHA-256
of all eight files they were pointed at were checked after each returned: **tree clean, all eight SHAs
unchanged**, and `~/prd-exec-instruments/` unchanged at 43 entries.

| # | mode | finding | disposition |
| --- | --- | --- | --- |
| 1 | red-team | two production files (`invalidator-registry.ts`, `production-wiring.ts`) reach the moved members **by name**, and the plan's sweep — keyed on `<file>:NNN` — is structurally blind to them | **CONFIRMED IN MECHANISM, REJECTED AS STATED.** Both docblocks cite the pin test **by path with no line number** and assert *behavioural* facts (`ROOT_CACHE_TTL` unread, the cache LRU-bounded only, a rename serving the pre-rename root) — every one preserved by a behavior-preserving move, so neither file needs an edit. **But the mechanism found four other sites the sweep could not see**, and became **C57** |
| 2 | red-team | the 2→3 constructor-injection choice is presented as `design.md` §5.1's decision; §5.1 states the edge and chooses no mechanism, and `tasks.md` §4's header says §5.1 names **one** edge, the 4→5 one | **CONFIRMED, and it changed the record.** Verified against both sources. Written up above as a real author-level decision with its rejected option instead of an inherited one |
| 3 | red-team | the `eventBus` subscription moving into module 3's constructor preserves count, timing and lifetime; `setMaxListeners(200)`, 41 construction sites, one other `indexing:started` subscriber with no ordering dependency, no test asserts listener count | **ACCEPTED as confirmation**, reported rather than omitted |
| 4 | red-team | `design.md` §3.2's *"20 construction sites"* does not reproduce — measured **41** across 9 files | **CONFIRMED.** True at Design and falsified by PR-D's own Phase 0 suites. Owed to `design.md` (**T20b**, §8.1 row 16); the per-instance conclusion is unaffected and holds at either figure |
| 5 | red-team | cap arithmetic (511 passed / 512 retained), the `symbol-graph.service.ts:817` precedent, the `2 of 30` verdict holding, `224 → 221`, 9 maximal bodies, `handle()` staying 175 — all verified against the tree | **ACCEPTED as confirmation.** Every prediction reproduced exactly against the post-edit gate run |
| 6 | evidence audit | 8 of 10 claim sets re-derived exactly: the 715 length, all six spans (cross-checked a second way through the gate's own AST output), the 88/131 totals **summed from the rows**, the `:374`/`:416` edge, the 7/10/20 sub-populations, C57's three-revision `git show` chain plus `merge-base --is-ancestor`, the live gate baseline, and the 511/512 cap | **CONFIRMED — all reproduce.** Fifth clean evidence-audit pass on this feature |
| 7 | evidence audit | *"892 tracked source files"* does not reproduce — measured **902** | **CONFIRMED IN MECHANISM, REJECTED AS AN ERROR.** Both are right under different extension sets: mine is `.ts .tsx .js .mjs .cjs` (**892**, and the set `t8b-crossfile-citations.ts` used), the auditor's `.ts .tsx .js .jsx` (**902** = 892 + 12 `.jsx` − 2 `.cjs`, arithmetic confirmed). **The defect is that the plan never stated its predicate**; the 12 `.jsx` are all benchmark corpus and fixtures and carry **0** citations, so the population is saturated either way |
| 8 | evidence audit | *"15 explicit citations"* does not reproduce — measured **12** | **CONFIRMED IN MECHANISM, REJECTED AS AN ERROR — and it is this feature's own "name the metric" rule.** **12** textual occurrences name **15** line numbers, because three are ranges (`:420-425`, `:444-448`, `:252-337`). Both figures are right and they are not the same number, exactly as T17's *"5 specifier lines re-exporting 7 symbols"* |
| 9 | evidence audit | *"0 `as unknown as` casts … same for the pin suite"* is false — the pin suite has **1**, at `:98` | **CONFIRMED, author corrected.** It is `as unknown as DefinitionLookupResult`, a `SymbolGraphService.listDefinitions` mock return, not a reach into `ReadFileTool`'s privates — so the RFS-06 AC-1 conclusion survives and the sentence supporting it was simply wrong. Measured: shapes **6 handle() / 0 casts**, containment **7 / 0**, pin **2 / 1** |

**Twenty-third and twenty-fourth time a critic's mechanism held while its conclusion did not** —
findings 1, 7 and 8 — and the **third** time a critic corrected a figure of the author's that then
survived re-measurement (findings 4 and 9). Both lenses also produced a confirmation this time
(findings 3 and 5), which is reported rather than dropped.

**One thing the auditor got wrong about the environment, worth recording so the next lens does not
repeat it**: it reported that `t8b-phase0-citation-census.ts` and `t8b-comment-only-proof.ts` *"do not
exist anywhere in the tracked tree or history"* and therefore could not be replayed. Both exist, in
`~/prd-exec-instruments/` — **outside the repository on purpose**. The mechanism was right (they are
untracked) and the conclusion — that the figures could not be replayed — was wrong; the comment-only
prover was in fact run against all six citation diffs for this task.

#### What T9 pins that no artifact named

1. **Correctness about what a change MOVED says nothing about what it SHIFTED** (C59). The sweep that
   found T9's 21 sites was blind to 27 more until the same instrument was asked the other question.
   That is C50/C52's family one level out, and the reason a citation census must report both classes
   separately rather than a single count.
2. **Widening a sweep's subject predicate is not self-evidently useful — patch it, run it, diff the
   counts.** Here rule 1 → rule 2 found two more citations and rule 2 → rule 3 found none, so the
   population is provably saturated. Without the diff, "I widened it" and "I widened it and nothing
   changed because nothing could match" read identically.
3. **A correction fixes the scope of the instrument it was written against, not of its sibling**
   (C57). C54 took the explicit sweep repo-wide and the bare sweep stayed hand-scoped to three
   carriers; the by-identifier population was never swept at all, by anything, at any task.
4. **A module suite earns its place at the branches its callers cannot reach.** Column B catches 10
   of 12; the 2 it misses are both failure branches that every handler-level suite stubs away. The
   honest justification for a coverage-forced test file is the size and identity of that gap, not the
   percentage.
5. **The instrument defect T1 recorded recurred verbatim.** The mutation harness read `bun test`'s
   summary with `execFileSync`, which captures **stdout only**, while bun writes that summary to
   **stderr on success as well as failure** — every baseline read "did not load". It **refused rather
   than reporting a table**, which is the property T1 added for exactly this reason: had it defaulted
   to *"no match → treat as pass"*, all thirteen rows would have read PASS.
6. **A second instrument defect, and it only became visible after the commit.**
   `t9-citation-sweep.ts` took its pre-change baseline as `HEAD`. That is correct while the work is
   uncommitted and **silently wrong the moment it lands**: `HEAD` becomes the post-T9 tree, `pre`
   equals `now`, and the sweep reports **moved-out 0, SHIFTED 0, stable 39** — *"nothing ever
   moved"* — which is indistinguishable from a clean result and would have made §10.11's own figures
   unreproducible for any later reader. Fixed by taking the ref as an argument and **refusing without
   one** rather than defaulting. Re-run as `bun t9-citation-sweep.ts 5fb88fd^` it reproduces this
   section exactly: **moved-out 0, SHIFTED 27, stable 5, ambiguous 9, adjudicated 2**. *A
   before-baseline must not read a moving reference — the same rule the frozen base (RFS-01 AC-3)
   exists to enforce on the subject, applied to the instrument.*

**Running total: sixty-four plan defects.**

### 10.12 T10 — executed, 2026-08-02

**Modules 4 and 5 are extracted, C34's `read-file.test.ts` repoint lands, and GMS-05 AC-3 is
satisfied for it.** `services/file-read/file-content-cache.ts` (`readFileWithCache` + `fileCache` +
`CACHE_TTL` + `FILE_CACHE_MAX_ENTRIES` + `interface CachedFile`) and
`services/file-read/file-metadata.ts` (`extractMetadata` + `detectLanguage` + `extractImports` +
`interface FileMetadata`). **Six new plan defects (C60–C65, the sixty-fifth to seventieth), running
total seventy.** The write set grew from the **5 + N** this row predicts to **17**, decided by the
user from three options.

#### The spans, AST-derived and anchor-verified — none of them is what the row cites

§5's T10 row is **pre-T7 and pre-T9** numbering throughout. Every span below was derived from the
TypeScript AST (declaration span + `getLeadingCommentRanges`) and cross-checked against a required
anchor string on its declaration line; a mismatch throws rather than reports.

| member | row cites | shipped decl | shipped with comments | dest |
| --- | --- | --- | --- | --- |
| `interface FileMetadata` | `:58-66` (`design.md` §5.1) | `:59-67` | `:59-67` | module 5 |
| `interface CachedFile` | `:68-72` (`design.md` §5.1) | `:69-73` | `:69-73` | module 4 |
| `fileCache` | by identifier | `:148` | `:148` | module 4 |
| `CACHE_TTL` | by identifier | `:149` | `:149` | module 4 |
| `FILE_CACHE_MAX_ENTRIES` | by identifier | `:157` | `:150-157` | module 4 |
| `readFileWithCache` | `:518-580` | `:401-463` | `:401-463` | module 4 |
| `extractMetadata` | `:582-628` | `:465-511` | `:465-511` | module 5 |
| `detectLanguage` | `:645-681` | `:528-564` | `:528-564` | module 5 |
| `extractImports` | `:683-706` | `:566-589` | `:566-589` | module 5 |

**188L declaration-only / 195L comment-inclusive**, both summed from the rows. `read_file.ts`
**590 → 392**. The code moved verbatim; nothing in either module differs from the source by a
character except `readFileWithCache`'s one eviction line (see C60).

#### C60 — the sixty-fifth: the `evictOldest` delegate could not survive T10, and three artifacts said it would

`read_file.ts`'s own docblock said *"T10 takes this one into
services/file-read/file-content-cache.ts, after which nothing calls this wrapper and T12 deletes
it"*; §5's T12 row inherits that; and this row is silent. **All three are falsified by this row's own
contents list.** The wrapper's body is
`evictOldestShared(cache, this.FILE_CACHE_MAX_ENTRIES - 1)`, and `FILE_CACHE_MAX_ENTRIES` is
**module 4's**. Once the field leaves the class the wrapper does not compile — dead or not — so the
deletion is **compile-forced at T10**, not a tidiness choice at T12. Measured: its only in-file call
site is `:453`, inside `readFileWithCache`, which also moves; and it has **0** reaches from any other
tracked file, `read-file.test.ts` having been repointed onto the shared operator at T8.

**Author level**, on the C34/C35/C37–C39/C41–C48/C50/C51/C53/C55–C59 precedent: GMS-05 AC-4 fixes the
answer (the tree must type-check) and the only alternative — holding `FILE_CACHE_MAX_ENTRIES` back in
`read_file.ts` — contradicts this row's own module-4 contents and leaves a dead constant behind.
T12's row loses the item. *Found by the red-team lens before a line was written, and it is C33's shape
one phase down: a clause and the work meant to satisfy it were checked at file granularity and
disagreed at member granularity.*

#### C61 — the sixty-sixth: T9's "moved-out 0" is false, and the sweep's own repoint is what blinded it

§10.11 closes C59 with *"post-repoint the sweep reads **moved-out 0**."* Measured, the true figure is
**1**. `read-file-containment-shapes.test.ts:231` carried
`// Containment runs at handle():207, BEFORE readFileWithCache at :222` — **exact against
`read_file.ts` at `5fb88fd^`**, and stale by four from T9 onward.

**The mechanism is the sharp part.** `t9-citation-sweep.ts` decides whether a file's bare `:NNN` are
citations into `read_file.ts` by testing whether the literal string `read_file.ts` occurs anywhere in
it. T9's own repoint rewrote all **5** occurrences in that file to `path-containment.ts:NNN`
— verified across three revisions, `grep -c` **5 → 0** — after which the file **dropped out of the
population the sweep read**. The sweep ran after the repoint, so it certified a tree it could no
longer see two citations in.

Corrected here: T9's post-repoint reading is **moved-out 1**, and its 43-row population is **45** under
a subject rule that also admits `ReadFileTool`. *C57 said a correction fixes the scope of the
instrument it was written against, not of its sibling. C61 is one turn further: **an instrument whose
subject predicate is a literal that its own repoint deletes verifies a smaller population than it
measured**, and the shrinkage is invisible because a smaller clean result reads exactly like a clean
result.*

#### C62 — the sixty-seventh: C55's ownership rule leaves a class with no owner

C55 assigns `+ N citation repoints` to *"the suites whose citations name the spans **that task
moves**"*, and C59 extends the distinction to citations a task merely **shifts**, assigning those to
*"the task that moves the subject."* **Both rules presuppose that some task moves the subject.**

Measured on the shipped tree, exactly one citation falsifies that presupposition:
`read-file-presentation-characterization.test.ts:72` cites `read_file.ts:160`
(`this.compressor = new CodeCompressor();`), which T10 shifts to `:135` and which **no remaining
Phase-3 task relocates** — the constructor stays, because its arity and parameter type are public
surface (`design.md` §3.2). Under C55/C59 as written its owner is nobody and it stays stale through
T25. **Resolved at author level by the only reading that closes it: a citation this task shifts whose
subject no later task moves is this task's.** C48's *"a break owned by nothing"*, fifth occurrence,
and the first where the gap is in the ownership **rule** rather than in a row.

#### C63 — the sixty-eighth: the by-FIGURE class, which no sweep on this feature has ever looked at

C57 widened the sweep from line citations to **by-FILE** and **by-IDENTIFIER** claims. There is a third
kind and it is in the gate itself: **`scripts/check-tools-thin.ts:380`** read *"…inflates
`read_file.ts` from 13 to 17"* — a claim about the live tree's own **counts**, naming no line and no
member, so invisible to every sweep this feature has run. The live gate prints **maximal 9, raw 10**;
the figure has been false since **T9**, and T9 edited this exact file for C57 without seeing it.

**The tell was internal.** The same file's docblock, 278 lines above, declares
*"DELIBERATELY STATED WITHOUT LIVE-TREE FIGURES … The gate PRINTS both counts per file on every run;
read them there, where they cannot go stale."* De-numbered rather than renumbered, on T8b's
`read_file.ts:484` precedent, and **without quoting the old figure** — the first draft did quote it,
which re-created the citation it was retiring and was caught by the round-trip verifier's own
de-numbering check.

#### C64 — the sixty-ninth: a shed-only phase added a body to the file the gate measures

§5's *"Acceptance reading for Phase 3"* states `read_file.ts` maximal bodies **13 → 0** and reads as
monotonic by assumption. **T10 adds one.** The 4 → 5 callback is wired as an arrow
(`(content, filePath, options) => this.fileMetadata.extractMetadata(...)`), and the constructor is
exempt from clause 1 **by kind**, so the arrow is counted **maximal** rather than nested — the C39
asymmetry `check-tools-thin.test.ts` pins synthetically. Predicted **4 / 5**, measured **5 / 6**, and
the delta is exactly that arrow.

The arrow is not negotiable: `.bind(...)` captured in the constructor freezes the pre-replacement
function and **silently** breaks the writeback case's spy, which mutation **M14** confirms is the only
sensor for it anywhere. Nor is it re-taking §4.1 — §4.1 fixes the callback, not its binding time.
**T12's row gains the obligation explicitly**: `read_file.ts` cannot reach maximal 0, and RFS-01 AC-1
cannot read `0 of 30`, until module 7 takes the composition. *A phase whose acceptance reading is a
decreasing count needs to say that a task may legally increase it in transit.*

#### C65 — the seventieth: §1's table stopped summing to its own total two tasks ago

Updating §1's Phase-3 row for T10 required re-deriving the sum, and the sum did not reconcile.
Measured, **§1's Phase-2 row has said 9 since Design and the true figure is 13**: T8b's write set grew
from 2 files to **8 + `spec.md`** on a user decision (C54, §10.10), §5's own T8b row records the
growth, and §1 was never carried back. `spec.md` is the only file in the whole plan that no phase row
listed, so the **distinct union is 81, not 80**.

**And the table's own self-check silently stopped applying.** §1 asserted *"the table sums to its own
total: 92 − 80 = 12, and the overlap rows below enumerate exactly 12 files"* — true only while every
overlapping file sits in exactly **two** phases. T8b put the three Phase-0 suites into Phase 2 and T9
put them into Phase 3, so each contributes **2** to the difference. There is also a **Phase 0 ∩ Phase 2**
pair that the overlap table never had a row for. Re-derived: `sum − union = Σ (phases − 1)` =
8×1 + 3×2 + 6×1 = **20 = 101 − 81**, and it reconciles.

Author level, on the C34/C53/C55 precedent — the figures are measurements, not decisions, and §5's
rows already carry the true write sets. *This is PR-C's **C19** shape for the fifth time on this
feature and the first time in the plan's own arithmetic: a growth landed in §5 and §10 and not in the
table that adds them up. **A table that advertises a self-check invites the reader to stop checking
it**, which is exactly what happened for two tasks.*

#### The write set — 5 + N predicted, 17 measured, three classes

**Decided by the user from three options** (fix-all-now chosen; 16 files leaving C61's file to T12, and
8 files deferring every by-file claim to T12, both rejected).

| tier | files | what |
| --- | --- | --- |
| structural | **6** | `read_file.ts`, the 2 new modules, their 2 new suites, `read-file.test.ts` (C34) |
| line citations T10 moves | **2** | `read-file-presentation-characterization.test.ts`, `read-file-project-root-rename-pin.test.ts` |
| by-FILE / by-IDENTIFIER / by-FIGURE | **8** | `lru-eviction-characterization.test.ts`, `services/cache/lru-evict.ts`, `lru-evict.test.ts`, `symbol-graph.service.ts`, `project-root-cache.ts`, `production-wiring.ts`, `invalidator-registry.ts`, `scripts/check-tools-thin.ts` |
| C61's orphan | **1** | `read-file-containment-shapes.test.ts` |

**Two of the eight are production files and T9 rejected the same finding**, so the distinction is
recorded rather than assumed. T9's red-team said `production-wiring.ts` and `invalidator-registry.ts`
reach the moved members by name; it was **confirmed in mechanism and rejected as stated**, because
both cite *unqualified* identifiers inside behavioural claims a behavior-preserving move preserves.
T10's case is the other half: both say **`ReadFileTool.CACHE_TTL`**, a **qualified member path** that
stops resolving the moment the field leaves the class. Same two files, different predicate, opposite
disposition.

**Eleven of the seventeen diffs are proven comment-only**, not asserted: both revisions parsed and
printed with `removeComments: true`, identical output, **11 of 11**.

#### The repoint is verified by round trip, and the frame is PER CITATION

The sweep takes one BASE for every row and **cannot verify its own repoints** — re-run at
`34a3f39` after the edit it reported `presentation:72 → :135` as SHIFTED, because it resolved `:135`
in the **pre-T10** tree. A separate verifier asserts, per pair, `text at OLD line in the revision that
citation was WRITTEN against === text at NEW line in the file it now names`:

```
PASS — 5 pair(s) verified by content against 3 distinct frames,
       2 de-numbering(s) verified in both directions, 0 mismatch
```

**Three frames, and each was derived rather than assumed**: `34a3f39` for the compressor line,
`5fb88fd^` for the three citations C59 deferred to T10, and **`38fdc52`** for
`pin:180`'s `read_file.ts:148` — which was *exact* on T8b's shipped tree, was shifted to `:149` when T9
removed `projectRootCache` above it, and was correctly attributed to T10 by C59's own rule. *That last
one was nearly written up as a T9 miss; the git history says it was scheduled.*

Post-repoint the sweep reads **moved-out 0**, and every remaining stale citation resolves into a
T11 or T12 span (**T11 1, T12 26**) rather than into nothing.

#### The discrimination table, two columns

Scratch-copy backup, SHA-256 byte-identity asserted on restore, refuse-on-anchor-not-found,
refuse-on-anchor-ambiguous, refuse-on-byte-identical, refuse-on-load-failure. **Never `git checkout`.**

**Choosing column B, re-chosen rather than inherited.** T7's was *"the suites that existed before
PR-D"*, T8's *"the six eviction suites as they stood at `HEAD`"*, T9's *"the pre-existing suites with
only the C53 repoint applied"*. T10 differs from T9 in one way that matters: it takes a **design
decision** — the late-binding arrow — whose only sensor anywhere is a pre-existing test it repoints.
So column B is **the pre-existing suites with only the C34 repoint applied**, which keeps that sensor
inside B where its verdict is informative and still asks R-26's question of the two coverage-forced
files.

| # | mutation | A: with T10's new suites | B: pre-existing only |
| --- | --- | --- | --- |
| M1 | cache key drops `includeSymbols` — the 08.search F33 bug reintroduced | FAIL 147p/7f | FAIL 78p/2f |
| M2 | cache key drops `relativePath` | FAIL 148p/6f | FAIL 79p/1f |
| M3 | TTL comparison `<` becomes `<=` | FAIL 152p/2f | **PASS 80p/0f** |
| M4 | TTL check removed entirely | FAIL 150p/4f | FAIL 79p/1f |
| M5 | eviction bound `CAP - 1` becomes `CAP` | FAIL 152p/2f | FAIL 79p/1f |
| M6 | eviction call deleted — the cache is unbounded | FAIL 152p/2f | FAIL 79p/1f |
| M7 | cap 512 → 256 | FAIL 151p/3f | FAIL 78p/2f |
| M8 | read-promotion removed from the hit path | FAIL 152p/2f | FAIL 79p/1f |
| M9 | legacy-entry repair no longer writes back | FAIL 152p/2f | FAIL 79p/1f |
| M10 | `detectLanguage` loses its `.ts` entry | FAIL 147p/7f | FAIL 79p/1f |
| M11 | `extractImports`' TypeScript pattern loses its `^` anchor | FAIL 153p/1f | **PASS 80p/0f** |
| M12 | `extractMetadata`'s `listDefinitions` try/catch removed | FAIL 153p/1f | **PASS 80p/0f** |
| M13 | `extractMetadata` queries the absolute path, ignoring `relativePath` | FAIL 153p/1f | **PASS 80p/0f** |
| M14 | **the 4 → 5 wiring: the arrow becomes a constructor-time `.bind()`** | FAIL 153p/1f | FAIL 79p/1f |
| M15 | one module-level `FileContentCache` shared across instances — the rejected design | FAIL 149p/5f | FAIL 75p/5f |
| M16 | comment-only edit in `file-metadata.ts` — **inert control** | PASS 154p/0f | PASS 80p/0f |

Baselines **A 154p/0f, B 80p/0f**; post-restore control **154p/0f, matches baseline**. Expectation
mismatches **0**. Killing cases read **by name**, never by count.

**The result a resumer should carry forward: column B misses 4 of 15, and the four are one boundary
and three unreachable branches.** M3 is the TTL predicate read *exactly at* the cap — every
pre-existing sensor steps a full second past it, so the `<`/`<=` distinction is unobservable to all of
them. M11, M12 and M13 are all `file-metadata`: the handler only ever asks for one language and one
import dialect, always stubs `listDefinitions` to **resolve**, and always passes a `relativePath`. So
eleven of fifteen mutations are already caught and the new files add **coverage, not discrimination**
on the extraction's main surface — R-26's concern measured rather than assumed, at 4 of 15 against
T9's 2 of 12. *The honest justification for a coverage-forced file is the identity of the gap, not the
percentage.*

**M14 is the row that justifies where the sensor lives.** The arrow-versus-`.bind()` choice is killed
in **B**, by C34's repointed writeback case — not by either new module suite. A decision taken in the
handler is sensed by the handler's own test, and moving that case onto a bare module would have
severed it.

#### Gates, all six plus both structural gates

`lint` exit **0**, proven to bite **on a T10 file**: a duplicate declaration appended to
`file-content-cache.ts` produced `…:146:7: error: Identifier dupProbeT10 has already been declared`
and exit **1**; restored SHA-256-identical (`52bd146b0b844198…`), lint back to **0**. `type-check`
**6/6, 0 cached** (forced). `build` **5/5, 0 cached** (forced), 5 `cache bypass, force executing`
lines. `test:scripts` exit **0**, **1114** pass / 0 fail across **49** files — unchanged, as it must
be for a commit adding no `scripts/` test. `test:plugins` exit **0**, **96** pass / 0 fail across 8.

**`check-core-layering` after `git add`: `PASS — 0 violation(s) across 977 tier-to-tier edges in 912
tracked files`.** Read it as **edges 973 → 977 (+4); files 908 → 912 (+4)**. `read_file.ts`'s own
`tools → services` count goes **5 → 6** — it loses `cache/lru-evict` with the delegate and gains both
`file-read/` modules — and the two new modules add three `services → services` edges
(`file-content-cache → {lru-evict, file-metadata}`, `file-metadata → symbol-graph.service`).
**RFS-03 AC-2 holds**: neither new module imports anything under `tools/`.

**`check-tools-thin` after `git add`: `FAIL — 2 of 30 … 215 members examined`, exit 1.** The verdict
`2 of 30` **holds**, which is the required reading — a drop to `1 of 30` would mean `read_file.ts`
went green two phases early. Members **221 → 215**: eight members leave (three fields, four methods,
the delegate) and two arrive (`fileMetadata`, `fileContent`). `read_file.ts` moves from
**9 / 10 / 1 / 175** to **5 / 6 / 0 / 175**, `handle()` **unchanged at 175** because its one call site
stays one line. **Clause 2's own reading goes `1 of 30` → `0 of 30`**: `fileCache` was its last subject
anywhere under `tools/`, so the `Map`/`Set` clause now flags nothing at all, two phases before the
gate goes green. C42 measured that clause at 1; it is now 0, and the note that its RED set is a strict
subset of clause 1's survives vacuously.

**Coverage on the two new modules, measured directly (R-36): both 100% funcs / 100% lines.**

**`bun run test` exited 1 on its first run and it is not T10's.** `apps/mcp-client`
`embedded-api-client-endpoints.test.ts` → *"POST web/fetch_and_index"* at **21155 ms** and
*"POST project/reset with projectId"* at **11588 ms** — the class `CLAUDE.md` documents for that exact
file, and the same file that failed at T9. Measured rather than waved off: `apps/mcp-client/` is
**zero-diff against `main`**; the file names **0** of `read_file`, `ReadFileTool`, `file-read`,
`file-content-cache`, `file-metadata`, `fileCache` or `CACHE_TTL`; and standalone it is
**95 pass / 0 fail under BOTH configs** — **3.80 s** under an empty `XDG_CONFIG_HOME` against
**16.90 s** under this machine's real one, a 4.4× live-provider penalty reproducing T9's 4.5×.
**Warm aggregate: 11/11 tasks, exit 0, 5 cached and all five are `:build`** — every one of the 6
`:test` tasks executed — core `[test-isolation] PASS: all 150 group(s)`. Both readings are recorded
rather than only the green one.

**The core group count is 149 → 150 for two new files, and the +1 was verified rather than assumed.**
`file-content-cache.test.ts` uses `setSystemTime` and is classified **process-global**, so the runner
forks it its own group; `file-metadata.test.ts` matches no isolation pattern and joins the mock-free
batch (**119** files). A resumer expecting +2 should read the runner's own classification lines.

#### The Plan Challenge gate on T10 — two modes, and the red-team rewrote the write set again

Mode selection reuses this feature's recorded route (`spec.md` §9.1, `design.md` §10). Per §10.7
finding 10 and §10.8 finding 1, **no harness ran while either lens was live**, and both were handed
measurements to attack rather than asked to reproduce a tree. `git status --porcelain` and the SHA-256
of all **14** files they were pointed at were checked after each returned: **tree clean, all 14 SHAs
unchanged**, `~/prd-exec-instruments/` unchanged at 47 entries.

| # | mode | finding | disposition |
| --- | --- | --- | --- |
| 1 | red-team | the `evictOldest` deletion at T10 is compile-forced and recorded nowhere; `read_file.ts:358-362`'s own docblock asserts the opposite and `tasks.md`'s T10 row never mentions the member | **CONFIRMED**, and it became **C60**. The mechanism was already in the plan handed to the lens; what the lens added is that three artifacts assert the opposite and none of them is `tasks.md`'s own row |
| 2 | red-team | the C61 repoint targets a value T10's own edit invalidates in the same commit, so a fix computed against the pre-edit tree lands wrong on arrival | **CONFIRMED AS A SEQUENCING CONSTRAINT, REJECTED AS A DEFECT.** The plan's method is T8b's — read the text at the old line in the revision the citation was written against, find it on the shipped tree — and the sweep is run **after** the structural edit. What the finding correctly forced is that this be stated: the repoint is computed post-edit, and the round-trip verifier above is what proves it |
| 3 | red-team | the sweep catches citations to code that MOVES but not to code that stays and SHIFTS; `presentation:72`'s `read_file.ts:160` is a live instance | **CONFIRMED IN MECHANISM, REJECTED AS STATED, AND IT BECAME C62.** The sweep reports SHIFTED as a first-class column — that is C59's entire subject — so it is not shift-blind. What it genuinely lacked is an **owner** for a shift whose subject nobody moves, which is the rule gap C62 records. Twenty-fifth time on this feature that a critic's mechanism held while its conclusion did not |
| 4 | red-team | the late-binding arrow's consequence for the spy is stated as a mechanism without stating that the spy TARGET changes | **ACCEPTED**, low. Named explicitly in `read-file.test.ts`'s repoint comment and pinned by M14 |
| 5 | red-team | `fs`/`path` dropping, the three-describe fan-out in `read-file.test.ts`, and `evictOldest`'s zero external reach all verified against the tree | **ACCEPTED as confirmation**, reported rather than omitted |
| 6 | evidence audit | 12 of 14 figure sets re-derived exactly with independent methods — the 590 length, all nine spans **summed from the rows**, both gate readings, the 5 `tools → services` edges, the single `fs`/`path` use sites, the delegate's span and zero external reach, the 13/24 subject-file split, the 8 by-claim files in **both** directions (no false positive, no missing ninth), and `tsconfig.json`'s `src/__tests__` exclusion | **CONFIRMED — all reproduce.** Sixth clean evidence-audit pass on this feature |
| 7 | evidence audit | the citation totals **43/45 do not reproduce** against a near-HEAD base — the same predicate reads 41/43 | **CONFIRMED AS AN INSTRUMENT DEFECT, and it was mine.** The bare-`:NNN` sanity bound was `n > pre.length`, keyed to whichever BASE was passed, so running at the pre-T10 base (591 lines) silently dropped every citation still carrying a pre-T7 number above it. Fixed by deriving the ceiling as the file's **high-water line count across `main..HEAD`** (716) rather than from BASE. *A bound that moves with the baseline is a before-baseline reading a moving reference — §10.11 item 6, in the sanity check rather than in the sweep* |
| 8 | evidence audit | one `ADJUDICATED` ruling matches nothing | **CONFIRMED, and it exposed a second instrument defect.** The list was keyed on `(file, comment line, cited number)`, and T10's own repoint shifted the comments, so rulings silently stopped matching. Re-keyed onto a **text fragment of the citing line**. The one that still matches nothing is correct: `presentation:27` names `e2e/08.search.test.ts:675` on the same line, so the foreign-filename guard rejects it before the bare scan — the ruling is redundant, not broken, and the instrument now says which |

**Twenty-fifth time a critic's mechanism held while its conclusion did not** (finding 3), and the
**second and third author-instrument defects this feature has had a critic find** (findings 7 and 8).
Both lenses also produced a confirmation (findings 5 and 6), reported rather than dropped.

#### What T10 pins that no artifact named

1. **An instrument whose subject predicate is a literal that its own repoint deletes verifies a
   smaller population than it measured** (C61). T9's sweep ran after T9's repoint and could no longer
   see the file it had shrunk out of scope. *A sweep must be re-run against the population it had
   BEFORE the edit, or keyed on something the edit cannot remove.*
2. **An ownership rule of the form "the owner is whoever moves it" has a null case, and the null case
   is silent** (C62). Exactly one citation on this tree names code no remaining task moves; under the
   rule as written it is owned by nobody and would have survived to T25.
3. **A count claim is a citation with no line number and no identifier** (C63), so it is invisible to
   every sweep keyed on either. The instance was in the gate that measures this extraction, and it
   contradicted its own file's stated policy 278 lines above.
4. **A phase whose acceptance reading is a decreasing count must say a task may legally increase it**
   (C64). The wiring arrow is the first body PR-D **adds** to `tools/`, and the constructor's
   exempt-by-kind status is what makes it maximal rather than nested.
5. **A global module mock is measured cross-contamination, not a style question.** The first draft of
   `file-content-cache.test.ts` stubbed `fs/promises` to count disk reads; run beside its eight
   sibling suites in one process the aggregate went **128 pass / 26 fail**, and
   `run-tests-isolated.ts` would have forked the file and hidden it. Rewritten onto real temp files
   with the rewrite-and-re-read observation — **154 pass / 0 fail** in one process — which is also
   closer to what production does.
6. **A de-numbering that quotes the figure it retires re-creates the citation.** The first drafts of
   both C63's and C61's replacement comments quoted the old numbers to explain them, and the
   round-trip verifier's de-numbering check caught both. T8b's `read_file.ts:484` precedent works
   because it names no number at all.

**Running total: seventy plan defects.**

---

### 10.13 T11 — executed, 2026-08-02

**Module 6 is extracted and `handle()` moves off 175 for the first time since T5.**
`services/file-read/line-range.ts` (`calculateRange` + `adjustRange` + `extractLines` +
`selectLines` + `interface ReadRange` + `MASSA_AI_READ_FILE_MAX_LINES` + the N9 clipping).
`read_file.ts` **392 → 315**. **Five new plan defects (C66–C70, the seventy-first to
seventy-fifth), running total seventy-five.** The write set is **8 files**, from two user
decisions: `spec.md` was added to the **6** §5's row provides for, and `check-tools-thin.ts`
plus its suite were added to fix a defect the gate's evidence-audit lens found in the gate itself.

#### The spans, AST-derived and anchor-verified — none of them is what the row cites

§5's T11 row is **pre-T7, pre-T9 and pre-T10** numbering throughout. Every span was derived from
the TypeScript AST (declaration span + `getLeadingCommentRanges`) and cross-checked against a
required anchor on its declaration line; a mismatch throws rather than reports.

| member | row cites | shipped decl | shipped with comments | kind |
| --- | --- | --- | --- | --- |
| `MASSA_AI_READ_FILE_MAX_LINES` | `:22-36` | `:33-36` | `:22-36` | `VariableStatement` |
| `interface ReadRange` | `:53-56` (`design.md` §5.1) | `:53-56` | `:53-56` | `InterfaceDeclaration` |
| the N9 clipping | `:235-249` | `:235-244` | `:230-244` | 2 statements **inside `handle()`** |
| `calculateRange` | `:485-507` | `:345-367` | `:345-367` | `MethodDeclaration` |
| `adjustRange` | `:509-516` | `:369-376` | `:369-376` | `MethodDeclaration` |
| `extractLines` | `:630-643` | `:378-391` | `:378-391` | `MethodDeclaration` |

**63L declaration-only / 79L comment-inclusive**, both summed from the rows. Only one of the six
cited spans — `MASSA_AI_READ_FILE_MAX_LINES`'s comment-inclusive `:22-36` — is still exact, and
only because it sits above everything three tasks have removed. **The N9 clipping is not a
declaration**, so it is located by walking `handle()`'s own statement list rather than by member
lookup; that is why the row's 15-line figure matches the *comment-inclusive* span and not the
statement-only one.

#### C66 — the seventy-first: module 6 as specified depends on the module that composes it

`design.md` §5.1 gives module 6 `calculateRange`, whose parameter is **`ReadFileParams`** — and the
same table gives `interface ReadFileParams` to **module 7**, which T12 builds and which **composes
2–6**. So the module table as written makes 6 import from 7: a backward edge against the composition
direction, naming a type that does not exist yet.

**§4's own header is the tell.** It opens *"`design.md` §5.1 names **one**"* cross-module state
decision and hands it to Tasks — the 4 → 5 edge. §4.1 and §4.2 then decide two. **This is a third,
of the same shape, and Design handed it to nobody**: the module table presents module 6 as
free-standing exactly as §5.1's note says the table wrongly presents modules 4 and 5.

**Resolved at author level**: module 6 declares `interface LineRangeRequest` — the **four** fields
`calculateRange` actually reads — and `ReadFileParams` satisfies it structurally, so no call site
changes and T12 passes its own interface unmodified. Rejected: moving `ReadFileParams` into module 6
(contradicts §5.1 and drags module 7's whole surface down a level), and four positional parameters
(rewrites the body instead of moving it, so the move stops being verbatim). GMS-05 AC-4 fixes the
answer — the tree must type-check — and the replacement was already named by the measurement.
**T12's row gains a note** so module 7 does not "unify" the two interfaces back into a cycle.

#### C67 — the seventy-second: the clipped path drops the line numbering, and nothing anywhere saw it

`extractLines` prefixes every line with a padded line number. The N9 cap **does not slice that
string** — it re-slices the RAW `lines` array and joins it (`read_file.ts:237-241` before this task).
**So a clipped response is unnumbered where an unclipped one is numbered**, and has been since
Wave 4.

**Found by the red-team lens before a line of module 6 was written**, and it changed the
implementation. The natural composition — *extract, then slice the extracted text* — is what
`selectLines` would have been on any reading of §5's row, and it would have **silently "fixed"** the
asymmetry: a behavior change inside a behavior-preserving PR, invisible to every gate.

**The evidence audit confirmed the zero coverage independently** and this task measured it:
`wave-4-correctness.test.ts` and `read-file-containment.test.ts` drive the cap **four** times
between them and every assertion is on the boolean, on `lineRange.actual.*`, or on
`content.split("\n").length` — a line **count**, identical numbered or not. **Mutation M10 is the
proof**: slicing the numbered text instead of the raw array is killed **only in column A**, by the
new suite alone. *A characterization gap is not "the tests are thin"; it is a specific mutation the
whole existing suite passes.* Pinned in both directions, logged and **not** fixed (`spec.md` §6,
R-07's precedent).

#### C68 — the seventy-third: `spec.md` §6 cites two sites for a variable neither sets

The row reads *"both read-file suites set the var in-process (`read-file-containment.test.ts:180`,
`read-file.test.ts:44`)"* under a subject naming **two** variables. Measured, both sites set
**`MASSA_AI_READ_FILE_ROOTS`**; **no test anywhere sets `MASSA_AI_READ_FILE_MAX_LINES` in a way that
can reach it**, because it is a module-level `const` evaluated once at import.

**And the table was short a site.** The N9 cap is read at **three** independent places with **three
different timings** — module 6 (once per process), `apps/tools-api/src/routes/workspace.ts:774`
(**per request**, for `symbol_snippet`) and `apps/mcp-client/src/embedded-api-client.ts:327`. The
third is why the row's own evidence read wrong: `workspace.test.ts:422` *does* set the variable and
its test passes, which looks like proof the tool honours it. Amended in place at `spec.md` §6, both
halves. *C63's class in an approved spec rather than in a gate: a claim with no line number and no
member, invisible to every sweep this feature has run.*

#### C69 — the seventy-fourth: the gate's population counter was pinned at 2, and its own suite could not see it

`scripts/check-tools-thin.ts:353` read `sf.forEachChild(() => membersExamined++)`. **`forEachChild`
stops the moment its callback returns a truthy value, and a post-increment returns the
pre-increment value** — 0 on the first child (continue), 1 on the second (stop). The top-level
contribution was therefore **exactly 2 in every file with two or more top-level nodes**, for the
whole life of the gate. Measured three ways: the shipped callback counts **2**, a braced one counts
**14**, and `read_file.ts`'s reported 16 is exactly `2 + 14` class members.

**It never moved a verdict** — `isViolation` does not read the field — **and it falsified both
sentences this file states about it**: `FileReading`'s *"class members plus top-level statements
inspected"* (`:235`) and the population note's *"a diffable record … a reviewer comparing it against
the frozen base is what closes that loop"* (`:160-162`). A counter pinned at 2 cannot distinguish a
dead subject from a live one, which is the one property **RFS-01 AC-1** asks the population print to
have and **R-37**'s mitigation depends on.

**The suite was blind by shape, not by omission.** Six assertions reached `membersExamined` and every
one was `> 0` or `=== a sibling reading`; all six pass at 2 exactly as at 14. *Sensor coverage is a
shape, not a population.*

**Fixed here, with the recalibration recorded — decided by the user** from four options (record-only
and hand to T25, fix without a recalibration record, and a new task T11b were rejected). On the same
tree the gate now reads `read_file.ts` **16 → 28** and the repo total **215 → 419**. Every figure at
T5 (**224**), T7 (**223**), T9 (**221**) and T10 (**215**) is on the OLD counter and must be read as
`2 + members` per file. The fix necessarily carried its suite — **T4b's precedent**, where closing
AC-5 needed the gate *and* its test — and the new sensor asserts the **delta** as well as the
absolute, so a counter that tracks a wrong base is caught too. **Observed red**: the reverse mutation
leaves **96p/1f** and the new case is the only one that dies, by name; restore SHA-256-identical.

**It is not cosmetic, and this very task is the proof.** On the old counter T11's member delta reads
**16 → 13**, −3, one per method. On the corrected counter it reads **28 → 24**, −4 — and the fourth
is `interface ReadRange` leaving the file, **a top-level member the old counter was structurally
incapable of noticing**.

#### C70 — the seventy-fifth: `adjustRange`'s Infinity ternary is dead branching

`range.end === Infinity ? totalLines : Math.min(range.end, totalLines)`. Measured over 32
`(end, totalLines)` pairs including `Infinity`, `0` and negatives: **0 differ** from the plain
`Math.min(range.end, totalLines)`, because `Math.min` already handles `Infinity`. Surfaced as
mutation **M6**, which "survived" column A — and it survived because it is an **equivalent
mutation**, not because a sensor is missing. Pre-existing, moved verbatim, **logged not fixed**:
simplifying it is a behavior-preserving change PR-D is not chartered to make, and it would break the
verbatim-move claim the extraction rests on. *Recorded because a surviving mutation and a mutation
with no subject read identically in a table, and only one of them is a gap.*

#### The write set — 6 predicted by two rows, 8 shipped, two user decisions

| tier | files | what |
| --- | --- | --- |
| structural | **3** | `read_file.ts`, `services/file-read/line-range.ts`, `__tests__/line-range.test.ts` |
| citation repoints (**N = 2**) | **2** | `read-file-presentation-characterization.test.ts` (2 rows), `wave-4-correctness.test.ts` |
| C68 — the spec row | **1** | `spec.md` §6, **user decision** |
| C69 — the gate | **2** | `scripts/check-tools-thin.ts` + its suite, **user decision** |

**N was resolved, not grown.** §5's row provides for *"+ N citation repoints"* and names one suite as
an example; the sweep measured N at **2**, so the first two tiers are exactly the row's own shape.
The growths that went to the user are `spec.md` and the gate pair.

**Both citation diffs are proven comment-only**, not asserted: both revisions parsed and printed with
`removeComments: true`, identical output, **2 of 2**.

#### The sweep derives its baseline PER CITATION, and that is the structural fix for §10.12's limitation

§10.12 records that the sweep *"takes one BASE for every row and cannot verify its own repoints"*, and
patched it with a separate round-trip verifier carrying a hand-derived frame per pair. **The frame is
a property of the citation, and git already stores it**: the commit that last modified the citing
line. This sweep therefore derives BASE per row from `git blame -L n,n` and falls back to `argv[2]`
only for uncommitted lines.

**Not a cosmetic change — measured:** over 40 citations in 912 tracked source files, **32 rows are
classified differently by a single `BASE=HEAD` than by their own frame.** Pre-edit attribution:
**T11 1, T12 31** (T10's one-BASE run read T12 26). NARROW and WIDE subject rules both return 40,
so the population is saturated.

**C62's null case materialized exactly as predicted, and the sweep reports it as its own class.**
Post-edit the sweep reads **moved-out 1, NO-OWNER 2** — `presentation:349` (cites `:645`,
`extractLines`' arrow, MOVED-OUT to module 6) and `presentation:72` (cites `:135`, the constructor's
`CodeCompressor` line, SHIFTED to `:115`). Neither resolves into any remaining owner span, so under
C55/C59 as written both are owned by nobody; **under C62 both are T11's** and both are discharged.

**One reading in that post-edit run is an artifact and is recorded rather than quoted.** It still
prints `T11 — 1`, for `presentation:25`. The OWNERS table is keyed on **line spans derived from the
pre-edit tree**, and post-edit `:240` is `metadata: {` — T12's result assembly — not the N9 clipping
that occupied those numbers before. *An owner table keyed on line numbers is only valid against the
tree it was derived from; the pre-edit run assigns ownership and the post-edit run's only job is to
surface what the edit falsified.*

#### The repoints, verified by round trip against two frames

```
PASS — 2 pair(s) verified by content against 2 distinct frames,
       1 de-numbering(s) verified in both directions, 0 mismatch
```

Frames derived, not assumed: **`f1413b6`** for `presentation:72` (`:135` → **`:115`**) and
**`38fdc52`** for `presentation:349` (`read_file.ts:645-649` → **`line-range.ts:138-142`**).
**The comparison is TRIMMED, and that is a real weakening stated rather than hidden**: T9 and T10
moved class members to class members and could assert exact equality; T11 moves three **methods** to
free **functions**, which dedents every moved line by two. The indentation delta is asserted
separately (`0, 2` — one pair unmoved, one uniformly dedented) so "trimmed" cannot conceal a body
that was reformatted rather than moved. The de-numbering in `wave-4-correctness.test.ts` is checked
in **both** directions: the retired fragment does not reappear (C63's trap) **and** the replacement
names the new home, or it would be a deletion wearing a repoint's clothes.

#### Two design decisions taken at author level, with their rejected options

1. **Module 6 is FREE FUNCTIONS, not a class.** Modules 2–5 are classes because each owns per-tool
   state; module 6 owns none, and module 1 (`services/cache/lru-evict.ts`) is a bare function for
   exactly that reason (`design.md` §5.2). *Rejected: a `LineRange` class per tool* — it adds a field
   and a constructor assignment to the one surface **C64** is about, and falsely implies per-instance
   state. Consequence measured: `read_file.ts` gains **no** member, which is why its member count
   falls by 4 rather than by 3 net.
2. **`selectLines` composes `extractLines` and the cap; `extractLines` stays exported.** The two were
   never separable at the call site — the cap reassigned the `selectedContent` and
   `selectedLineCount` `extractLines` produced one line earlier. *Rejected:
   `clipToMaxLines(lines, range, content, count)`*, which duplicates the `.split("\n")` at the call
   site and passes an argument derivable from another.

**`MASSA_AI_READ_FILE_MAX_LINES` moves verbatim as a module-level IIFE**, and the timing is
unchanged in the only sense that is observable: it is evaluated once at module-body evaluation
either way. Module 6 is a dependency of `read_file.ts` so it now evaluates strictly earlier in the
graph, but both happen on the first import of `read_file.ts`. **The red-team corrected the author's
premise here** — the plan asserted *"zero tests in the repo set that env var"*, which is false:
`workspace.test.ts:422` sets it, and drives the **per-request** copy at `workspace.ts:774`. The
narrower claim survives and is what C68 records.

#### The discrimination table, two columns

Scratch-copy backup, SHA-256 byte-identity asserted on restore, refuse-on-anchor-not-found,
refuse-on-anchor-ambiguous, refuse-on-byte-identical, refuse-on-load-failure. **Never `git checkout`.**

**Each column is the union of TWO processes, and that is new.** `wave-4-correctness.test.ts` carries
the N9 sensors and therefore matters most to column B — but it matches **two** of
`run-tests-isolated.ts`'s isolation patterns (`mock.module(` at `:533` and `process.env.X =` at
`:38`), so CI forks it. Run beside its siblings it reports **7 failures** in its unrelated N4
describes; standalone it is **24p/0f**. Folding those 7 into a mutation reading would have made
every row look killed. *A baseline taken in a configuration CI never runs is not a baseline.*

**Choosing column B, re-chosen rather than inherited.** T10's was *"the pre-existing suites with only
the C34 repoint applied"*, because T10 took a design decision whose only sensor was a test it
repointed. T11's repoints are **comment-only**, and its one characterization decision — C67's
clipped format — has **no pre-existing sensor at all**, which is itself the finding. So B is simply
**the pre-existing suites**, and the question it answers is how much of module 6 was already pinned
by driving `handle()` from outside.

| # | mutation | A: with T11's new suite | B: pre-existing only |
| --- | --- | --- | --- |
| M1 | `calculateRange` drops the `lineStart` floor | FAIL 203p/1f | **PASS 178p/0f** |
| M2 | its `lineStart`/`lineEnd` guard becomes `\|\|` instead of `&&` | FAIL 203p/1f | **PASS 178p/0f** |
| M3 | `offset`/`limit` becomes exclusive — `offset + limit`, not `- 1` | FAIL 201p/3f | **PASS 178p/0f** |
| M4 | the limit default becomes nullish, so `limit: 0` stops defaulting | FAIL 203p/1f | **PASS 178p/0f** |
| M5 | `adjustRange` drops the start floor of 1 | FAIL 202p/2f | **PASS 178p/0f** |
| M6 | `adjustRange` stops expanding `Infinity` — **EQUIVALENT, see C70** | PASS 204p/0f | PASS 178p/0f |
| M7 | `extractLines` pads to 4 instead of 6 | FAIL 192p/12f | FAIL 173p/5f |
| M8 | `extractLines` numbers relative to the slice, not the file | FAIL 202p/2f | **PASS 178p/0f** |
| M9 | the cap comparison becomes `>=` — clipping fires exactly AT the cap | FAIL 202p/2f | **PASS 178p/0f** |
| M10 | **the clip slices the NUMBERED text — C67's asymmetry silently "fixed"** | FAIL 202p/2f | **PASS 178p/0f** |
| M11 | the N9 default drops 500 → 250 | FAIL 196p/8f | FAIL 175p/3f |
| M12 | `lineCount` is not recomputed after clipping | FAIL 198p/6f | FAIL 175p/3f |
| M13 | the clip slices from the file's start rather than the range's | FAIL 203p/1f | **PASS 178p/0f** |
| M14 | the env guard drops its positivity check — **UNREACHABLE in-process** | PASS 204p/0f | PASS 178p/0f |
| M15 | comment-only edit in `line-range.ts` — **inert control** | PASS 204p/0f | PASS 178p/0f |

Baselines **A 204p/0f, B 178p/0f**; post-restore control **204p/0f, matches**. Killing cases read
**by name**, never by count.

**Two rows are not discriminating subjects and were re-measured rather than reported as survivors.**
M6 is C70's equivalent mutation (32 pairs, 0 differing). M14's branch is unreachable in-process — the
variable is unset, so `Number(undefined)` is `NaN` and both the guarded and unguarded forms return
500; that is the branch the module's docblock and the suite's *"What is NOT asserted"* section both
name. **So the honest denominator is 12, A kills 12 of 12 and B kills 3 of 12** — against T10's
4-of-15 miss and T9's 2-of-12. *This is the first Phase-3 module where the new suite is
discrimination rather than coverage*, and the reason is structural: the three range functions are
reachable from `handle()` only through whole-file reads, so every arithmetic detail below the
response surface was unpinned. The three B does kill (M7, M11, M12) are the ones whose effect reaches
the response — the numbering format via the presentation suite's token math, and the cap via the N9
tests.

#### Gates, all six plus both structural gates

`lint` exit **0**, proven to bite **on a T11 file**: a duplicate declaration appended to
`line-range.ts` produced `…:187:7: error: Identifier dupProbeT11 has already been declared` and exit
**1**; restored SHA-256-identical (`712a79238f68d2dd…`), lint back to **0**. `type-check` **6/6, 0
cached** (forced); `build` **5/5, 0 cached** (forced), 5 `cache bypass, force executing` lines.
`test:scripts` exit **0**, **1114 → 1115** pass / 0 fail across **49** files — the **+1** is C69's
new sensor, and a commit adding a `scripts/` test is the one case where this figure must move.
`test:plugins` exit **0**, **96** / 0 across 8.

**`check-core-layering` after `git add`: `PASS — 0 violation(s) across 978 tier-to-tier edges in 914
tracked files`** — edges **977 → 978 (+1)**, files **912 → 914 (+2)**. `read_file.ts`'s own
`tools → services` count goes **6 → 7**: it gains `file-read/line-range` and loses nothing, because
the three methods it shed named no module. **Module 6 adds zero edges — it imports nothing at all**,
which is module 1's property (RFS-02 AC-3's replacement) and is asserted by an AST walk in its own
suite rather than by a text match. **RFS-03 AC-2 holds.**

**`check-tools-thin` after `git add`: `FAIL — 2 of 30 … 415 members examined`, exit 1.** The verdict
`2 of 30` **holds**, which is the required reading — a drop to `1 of 30` would mean `read_file.ts`
went green one phase early. `read_file.ts` moves **5 / 6 / 0 / 175 → 1 / 1 / 0 / 165**.

**Both body counts move, and that was the point.** `extractLines` carried the file's only nested body
(its `.map` arrow), so it was the *entire* raw-vs-maximal gap; T11 removes four maximal bodies (the
module-level IIFE, `calculateRange`, `adjustRange`, `extractLines`) and that one nested arrow, taking
`6 / 5` to `1 / 1`. **The single survivor is C64's 4 → 5 wiring arrow at `:144-145`**, exactly as
C64 predicted, and it is why the file cannot reach maximal 0 before T12.

**`handle()` reads 165, the first reading other than 175 since T5**, because the N9 clipping is 15
comment-inclusive lines inside it and the replacement is 12. *A reading that had stayed 175 would
have meant the clipping did not move.* Still **45 over** the ceiling of 120, which T12 closes.

**Coverage on the new module, measured directly (R-36): 100% funcs / 100% lines.**

**`bun run test` exited 0 on its first run**, unlike T9's and T10's. 11/11 tasks, **5 cached and all
five are `:build`** — every one of the 6 `:test` tasks executed — core `[test-isolation] PASS: all
150 group(s)`. **The group count is unchanged at 150 for one added file, and the mechanism was
verified rather than assumed**: `line-range.test.ts` matches **no** isolation pattern, so it joins
the mock-free batch instead of being forked. A resumer expecting 151 should read the runner's
classification, not the file count. `apps/mcp-client`'s
`embedded-api-client-endpoints.test.ts` did **not** fail this time; the class `CLAUDE.md` documents
for it is a first-run/cold-provider effect, and its absence is recorded as an observation rather than
as a fix.

#### The Plan Challenge gate on T11 — two modes, and both changed the work

Mode selection reuses this feature's recorded route (`spec.md` §9.1, `design.md` §10). Per §10.7
finding 10 and §10.8 finding 1, **no harness ran while either lens was live**, and both were handed
measurements to attack rather than asked to reproduce a tree. `git status --porcelain` and the
SHA-256 of all **12** files they were pointed at were checked after each returned: **tree clean, all
12 unmodified, HEAD unchanged**. The evidence-audit agent **self-reported writing two `/tmp` files**
against its instructions and having removed them; both were verified absent.

| # | mode | finding | disposition |
| --- | --- | --- | --- |
| 1 | red-team | the clipped path drops `extractLines`' numbering, nothing pins either state, and D3's phrasing would have silently "fixed" it | **CONFIRMED, and it became C67 — the finding changed the implementation before it was written.** Mutation M10 is the proof it was invisible: killed only in column A |
| 2 | red-team | `presentation:200-203` carries a five-citation cluster stale by a uniform +6 right now, and T11's stated repoint rationale would not surface it | **CONFIRMED IN MECHANISM, REJECTED AS STATED.** The sweep already reported every one of them — `:283 → :277`, `:304 → :298`, `:319 → :313` and two AMBIG — and attributed all five to **T12**, which moves those spans. Repointing them at T11 buys a third falsification, which is §10.11's own reason for deferring. **Twenty-sixth time on this feature that a critic's mechanism held while its conclusion did not** |
| 3 | red-team | `presentation:72` breaks because content *above* it moved, and a repoint pass driven by "which citations name a relocated identifier" misses it structurally | **CONFIRMED as already-planned.** This is C62, recorded at T10 precisely for this class, and it was item 5 of the packet the lens was given. Reported as a confirmation rather than dropped |
| 4 | red-team | D4's premise *"zero tests set that env var"* is false — `workspace.test.ts:422` sets it | **CONFIRMED, and the author's figure was wrong.** The narrower claim survives (that test drives `workspace.ts:774`'s per-request copy), and the correction is half of **C68** |
| 5 | red-team | `handle() ≈ 165` rests on a call-site shape the plan had not committed to; T14b's C43 precedent is an explanatory comment eating the predicted margin | **ACCEPTED**, medium. The shape was fixed before implementation and the figure then measured: **exactly 165** |
| 6 | evidence audit | `check-tools-thin.ts:353`'s `forEachChild(() => membersExamined++)` short-circuits, pinning the top-level count at 2 for every file | **CONFIRMED, and it became C69** — re-measured independently (2 vs 14 vs `2 + 14 = 16`) before acceptance. **The fourth author-side instrument defect a critic has found on this feature**, after T10's two |
| 7 | evidence audit | `spec.md:570` cites two sites that set a different variable, and the duplication table is short a third site | **CONFIRMED**, and it is the other half of **C68** |
| 8 | evidence audit | `check-tools-thin.ts:81`'s *"`read_file.ts`'s 11 methods"* — is it a live figure gone stale, or scoped history? | **RE-MEASURED AND LEFT.** Scoped to a named design-time measurement (*"written while `design.md` §6.5 was being measured"*) and naming `evictOldest<K, V>`, deleted at T10 — the same "quoted history" class as the two `:167`/`:168` adjudications. Not a C63 instance |
| 9 | evidence audit | 8 of 12 figure sets re-derived exactly — the 392 length, all six spans **and their sum**, `handle()`'s 175 with the gate's comment-inclusive span rule read off its source, the identity of the 5 maximal and 1 nested body, the whole-gate 30/27/215/2, and `presentation:349`'s frame-anchored resolution | **CONFIRMED — all reproduce.** Rows I and K (the 40-row sweep and the by-claim widening delta) were **explicitly declined as unreproducible within budget rather than silently skipped**, which is the honest report |

**The audit's own headline figure did not survive re-measurement, and the mechanism did.** It
estimated the corrected repo total at **364** from a handler-files-only sweep; measured through the
fixed gate it is **419**. *Keep the mechanism, re-run the number* — third occurrence on this feature.

#### What T11 pins that no artifact named

1. **A citation's baseline is a property of the citation, and git stores it** — the commit that last
   modified the citing line. Deriving BASE per row from `git blame` rather than taking one per run
   reclassified **32 of 40** rows, and it is what lets a sweep be re-run after its own repoint.
2. **An owner table keyed on line spans is only valid against the tree it was derived from.** Re-run
   after the edit, the sweep re-attributes rows to whatever now occupies those numbers — one row
   read `T11` for a span that is now T12's result assembly. The pre-edit run assigns ownership; the
   post-edit run's only job is to surface what the edit falsified.
3. **A surviving mutation and a mutation with no subject are indistinguishable in a table** (C70,
   M14). Two of fifteen rows here were an *equivalent* mutation and an *unreachable* branch; both
   read as "the suite missed it" until re-measured, and the honest denominator is 12, not 15.
4. **A baseline taken in a configuration CI never runs is not a baseline.** Column B's most important
   suite is forked by `run-tests-isolated.ts`; run beside its siblings it contributes 7 unrelated
   failures. Each column had to become the union of two processes.
5. **Sensor coverage is a shape, not a population** (C69). Six assertions reached the defective
   counter and all six were shape assertions, so the suite was blind by construction. The replacement
   asserts the **delta** as well as the absolute, because a counter tracking a wrong base is the next
   version of the same defect.
6. **A round-trip check weakened to accommodate a legitimate change must say so and re-close the gap
   another way.** Moving methods to free functions dedents every line, so exact text equality had to
   become trimmed equality — and the indentation delta is asserted separately so a reflow cannot hide
   inside the trim.

**Running total: seventy-five plan defects.**
