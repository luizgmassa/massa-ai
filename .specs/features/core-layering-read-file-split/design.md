# Core Layering — `read_file.ts` Split (PR-D) — Design

- **Slug**: `core-layering-read-file-split` · **PR-D**
- **projectId**: `massa-ai` · **workflowSessionId**: `spec-core-layering-read-file-split`
- **Specify**: `spec.md`, on `spec/pr-d-read-file-split` (`a866537`, `183573c`) — **not yet on `main`**
- **Base**: `main` @ `f06b01d` (the v1.17.0 release bump on PR-C's merge `2bea11e`)
- **Status**: **Design complete**, 2026-07-31. **Full Plan Challenge gate run** (§10) — two modes,
  twelve findings, all twelve independently re-measured and confirmed, all twelve revising this
  document. Specify §7's three owed decisions are delivered in
  §1, §3 and §4, each with its rejected alternatives and the measured reason each failed. Two
  further decisions were forced by measurement and taken with the user in the same session (§6,
  §5.2). **PR-D is now sized** (§7). Tasks not started.

Specify named **three** decisions Design owes before PR-D is sized. Delivering them required
answering **two more**, because measurement falsified the stated rationale of a Specify decision in
one case and revealed an unowned gap in the other. All five are recorded here with their rejected
options. Four new plan defects — **C29**, **C30**, **C31**, **C32** — are the thirty-sixth through
thirty-ninth across this umbrella feature.

**Where Specify's three questions are answered**, since this document is ordered by dependency
rather than by their numbering: **§7.1** (naming) → **§1**; **§7.2** (`EXCLUSIONS`) → **§4**;
**§7.3** (`N`) → **§3**, which cannot be answered before **§2**.

---

## 0. Method note — the first figures in this feature that a critic got right and the author got wrong twice

`spec.md` §9.1 recorded the ninth consecutive critic whose mechanism held, and *"the first whose
figures held while the author's did not."* **That has now happened twice in a row, and the second
time it was this Design's own sweep.**

Measuring `services/graph/`'s importer fan-out (§1), the first pattern used here was
`from ["'][^"']*services/graph/` — quote-agnostic, repo-wide, both of PR-C's recorded lessons
applied. It returned **6 importing files**. A read-only investigator returned **19**, and its
mechanism was better: it resolved each specifier against the filesystem rather than matching the
specifier's *text*.

Re-measured with a resolver-accurate sweep, the investigator's figure reproduces exactly — 19 files,
28 edges. The cause is that **three distinct relative shapes reach one directory**, and any pattern
anchored on one of them undercounts:

| shape | example | files | seen by `…services/graph/`? |
| --- | --- | --- | --- |
| `../services/graph/` | `__tests__/graph-queries.test.ts:14` | 6 | ✅ |
| `../graph/` | `services/memory/memory-controller.ts:19` | 6 | ❌ |
| `./graph/` | `services/index.ts:127` | 1 | ❌ |

This is the same family as **C15** (a double-quote anchor), **C16** (a prefix anchor) and the
`src/*` vs `src/**` pathspec trap — a positional assumption baked into a pattern, invisible from the
pattern. **The rule this adds: a fan-out figure must come from resolving specifiers, not from
matching them.** Every importer count in this document was taken that way, and the script is quoted
where each is used.

It has an immediate consequence for §1's own acceptance reading — see §1.4.

---

## 1. Specify §7.1 — `services/graph/` → `services/memory-graph/`

**Decision: rename `packages/core/src/services/graph/` to `packages/core/src/services/memory-graph/`.**
**Decided by: the user, 2026-07-31**, from three options presented with their measured write sets.

### 1.1 The measured trap is three directories, not two

`spec.md` §7.1 and `CLAUDE.md:237` both frame this as a two-way ambiguity. It is three-way:

| directory | files | LOC | what it is |
| --- | --- | --- | --- |
| `packages/core/src/services/graph/` | 7 | 1766 | the **memory-relation** graph |
| `packages/core/src/services/symbol/` | 12 | 4304 | the **symbol** graph + `GraphController` (PR-C moved it here) |
| `packages/core/src/data/symbol/` | 9 | — | the symbol **repository** |

Two filenames repeat the ambiguity inside the directories: `services/symbol/graph-controller.ts` is
a `graph-*` file under `symbol/`, and `services/symbol/symbol-graph.service.ts` carries both words
in one name. `services/index.ts` already ships a collision workaround —
`MemoryRow as GraphMemoryRow` at `:132`, inside the `export type { … } from "./graph/types.js"`
block opening at `:131`.

**The trap has already produced a real path error**: `.specs/features/wave-5-cross-pollination/`
cites `packages/core/src/services/symbol/symbol-repository-pg.ts`, a file that lives at
`packages/core/src/data/symbol/`.

### 1.2 Write set, measured (resolver-accurate, repo-wide over 871 tracked `.ts`/`.js`)

**Name the metric — three are quotable here and two of them diverge.** *Import lines* is what a
task rewrites; *unique (file → module) edges* is what a dependency graph counts. They coincide for
`services/graph/` and do not for `services/symbol/`, and the first version of this table quoted
edges for one and called it lines for the other (§10, evidence audit finding 2).

| | `services/graph/` | `services/symbol/` |
| --- | --- | --- |
| files to `git mv` | **7** | 12 |
| importing files to edit | **19** (7 production, 12 test) | **32** (13 production, 19 test) |
| **import lines to rewrite** | **28** | **90** |
| unique (file → module) edges | 28 | 63 |
| of which `mock.module` string specifiers | **6** | 10 |
| re-exports in `services/index.ts` | **7** (`:127-135`) | 59 |
| `package.json` `exports` subpaths reaching it | **0** | 0 |

`packages/core/src/services/memory-graph/` is free — **0** tracked files match it today.

### 1.3 Options rejected, and why

1. **Document only; leave the paths.** Cheapest — 0 importers, three prose edits. **Rejected by the
   user.** It is the option already taken once, at `CLAUDE.md:237`, and the measured harm above
   accrued *after* it was taken. This Design recommended it on the ground that PR-D rewrites none of
   the 19 files, so a rename here breaks the umbrella's own **AS-03 / GMS-04 AC-1** precedent —
   *rename exactly once, inside the change that already rewrites the files* — and **R-24** already
   prices PR-D at five distinct changes. **The user overrode that recommendation**, and the
   recommendation is recorded here rather than dropped, because the trade it declined is real and a
   later reader is entitled to see it: PR-D pays a 19-file rename for a directory it otherwise never
   opens.
2. **Rename `services/symbol/` instead.** **Rejected on measurement**: 32 importers / **90 import
   lines** / 10 `mock.module` / 59 re-exports — over three times the write set — and **it does not
   resolve the collision**, because `data/symbol/` remains. Renaming the larger, more-coupled
   directory to fix an ambiguity it shares with a third directory buys nothing. *(This row first
   said 64, which is the **edge** count; the line count a task actually rewrites is 90. The
   correction makes the rejected option more expensive, so it strengthens the rejection rather than
   reopening it.)*

**`data/symbol/` vs `services/symbol/` is left alone deliberately.** It is a *tier* pair, and the
layer contract in `packages/core/src/index.ts` and `CLAUDE.md` already disambiguates it: one is
persistence, one is domain logic. That is a distinction a reader can derive from the contract; the
`graph`/`symbol` one is not.

### 1.4 The rename is ungated, and the obvious acceptance reading is blind to every production edge

Two measurements, both taken before choosing a sensor:

**`check-stale-pointers` cannot see this rename at all.** `PREFIX_STEMS = ["rlm", "search-facade"]`,
`SUFFIX_STEMS = ["controller"]`. **None of the 7 `services/graph/` files matches either stem** —
`graph-queries`, `graph-store-factory`, `graph-store-pg`, `index`, `memory-graph.service`,
`relation-extractor`, `types` — so a stale citation of any of them after the rename can never become
a `POINTER` match, can never move `HISTORICAL_PINNED = 28`, and the gate reports an unchanged
`PASS`.

*(A first draft of this paragraph said "of the 19 files in scope only
`services/symbol/graph-controller.ts` is suffix-shaped" — wrong, and the gate caught it (§10,
evidence audit finding 4): that file is not among the 19 importers at all. Measured, **4** of the 19
importers are stem-shaped — `memory-controller.ts` by the suffix branch and
`search-facade-{hybrid,indexing,synapse}.test.ts` by the prefix branch. **That does not help**: the
gate matches on the **cited filename**, not on the citing file, and the cited filenames are the 7
above. Four importers being under the gate for their *own* names changes nothing about citations
pointing *into* the renamed directory.)*

This is **C21's class**, and the script's own docblock names it:
*"a stem outside `PREFIX_STEMS`/`SUFFIX_STEMS` … is as uncovered as before and is not this gate's
to close."* PR-D does **not** widen the stem alphabet — that is C21's owner's work (`spec.md` §1),
and adding `graph` as a prefix stem would match `graph-queries.ts`, `graph-store-pg.ts`,
`graph-controller.ts` and `graph-stream.ts` across three directories, which is a corpus change with
its own re-pin.

**A literal-string sweep would certify the rename while missing all 12 production edges.**
Measured: `git grep -c 'services/graph'` outside the gate's `EXCLUDED` returns **27 occurrences
across 16 files** — and the 12 production import lines are **not among them**, because they are
written `./graph/…` or `../graph/…` and contain no `services/` segment at all. Total literal
occurrences repo-wide are **241 across 27 files**, of which **200** are in `.ua/` (deferral §4.4)
and **13** in `.specs/`.

**So the acceptance reading is the resolver sweep, not a grep count**: after the rename,
`packages/core/src/services/graph/` has **0 members and 0 resolvable importers**, measured by
resolving every relative specifier in all 871 tracked `.ts`/`.js` files. Stated as a shape, not a
population — **C10's rule**.

**The 6 `mock.module` specifiers are the sharp edge.** They are strings; `tsc`, `build` and
`type-check` are blind to all six. A missed one does not fail — the registration silently targets a
path nothing loads, the mock never applies, and the test runs against the real module. The 22
static edges are covered by `tsc`; these six are covered by nothing but the resolver sweep above.
They are enumerated in §7 so no task re-derives them.

**Eight further citations are fixture literals, not references.**
`scripts/__tests__/check-coverage.test.ts` cites `src/services/graph/graph-queries.ts` at `:12`,
`:38`, `:51`, `:58`, `:106`, `:107`, `:115` and `:143`. `BASE` there is the synthetic
`"/repo/packages/core"` and no path is resolved on disk — they are the measured shape of a real
defect used as an lcov fixture, the same class as `check-stale-pointers`' own test file, which that
gate's `EXCLUDED` list carries for exactly this reason. **They are repointed as prose** (they cite a
file that will no longer exist) but they are not load-bearing, and no test breaks if they are
missed. `scripts/check-coverage.ts:279` carries the same citation in a docblock.

---

## 2. C29 — the thirty-sixth plan defect: the 392-line figure excludes 98 lines inside `handle()`

**Found while drawing the module boundaries §3's `N` depends on — not by re-reading `spec.md`.**

`spec.md` §3 marks this row **✅ reproduces** and calls it *"AS-06's surviving leg"*:

> `read_file.ts` is ~55% domain logic (~390 of 707) → **392 lines, 55.4%** — 13 private methods
> (358) + the `MASSA_AI_READ_FILE_MAX_LINES` const (15) + the constructor's `eventBus` subscription
> (15), classified per section

**Three things in that sentence do not hold.**

1. **There are 11 private methods, not 13.** `spec.md` §3.A's own table says **11**, measured by
   brace-matching the class body. The two sections contradict each other and §3.A is right.
2. **The stated components do not sum to the stated total.** `358 + 15 + 15 = 388`. And 358 is
   `:350-707`, which includes the class's own closing brace at `:707`; the private-method region
   proper is `:350-706` = **357**, giving **387**. Neither is 392.
3. **Decisively — the figure excludes 98 lines of non-delegation logic inside `handle()`.**
   `handle()` is `:174-348`, **175 lines**, of which **98 are non-delegation, 64 delegate, and 13
   are structural** — the signature line `:174`, the closing brace `:348`, and the 11 blank lines
   separating the segments. *(A first draft said "only 77 of them delegate", from `175 − 98`. The
   gate caught it (§10, evidence audit finding 3): the rows below sum to 162, not 175, because the
   spans skip the blanks. The 98 that C29 turns on is unaffected — it is the sum of the five ❌ rows,
   measured, not a residual.)*

| segment | lines | span | delegation? |
| --- | --- | --- | --- |
| param unpacking | 7 | `:175-181` | ✅ |
| `resolveFilePath` + null guard | 14 | `:183-196` | ✅ |
| containment call + guard | 15 | `:198-212` | ✅ |
| `relativePath` + `calculateRange` | 5 | `:214-218` | ✅ |
| `readFileWithCache` | 7 | `:220-226` | ✅ |
| split / `adjustRange` / `extractLines` | 6 | `:228-233` | ✅ |
| **N9 clipping** | **15** | `:235-249` | ❌ line-range math + a policy cap |
| **compression decision** | **5** | `:251-255` | ❌ orchestration |
| **result-object assembly** | **27** | `:257-283` | ❌ presentation |
| **compression + token math + recommendation** | **38** | `:285-322` | ❌ orchestration + presentation |
| **usage-tip recommendations** | **13** | `:324-336` | ❌ presentation |
| `serializeToolResponse` | 1 | `:338` | ✅ |
| catch block | 9 | `:339-347` | ✅ |
| **rows sum** | **162** | | **98 non-delegation, 64 delegation** |
| **+ structural** | **13** | `:174`, `:348`, 11 blank separators | — |
| **`handle()` total** | **175** | `:174-348` | |

**GMS-02 AC-1 is *"no longer holds logic that is not schema validation or delegation."*** Those 98
lines are neither. The parent `spec.md`'s Evidence row classified the file into *"schema /
delegation / logic / presentation"* — a four-way split against a criterion that admits **two**
categories, and the two extra categories are where the 98 lines went.

**Why this is a defect and not bookkeeping.** `read_file.ts`'s current `handle()` is the largest in
`tools/` by a wide margin — the 27 files that declare one run 175 / 128 / 113 / 101 / 99 / … /
3, median **51**. A PR that extracts 392 lines and leaves a 175-line `handle()` closes GMS-02's
headline on a file that still assembles result objects, computes token savings and writes
recommendation strings. **RFS-01's gate as specified cannot see any of it** — a rule stated over
`private` methods and `Map`/`Set` instance fields passes a 175-line `handle()` without comment. That
is **C28 one level down**, in the instrument PR-D ships to replace the one C28 disqualified.

### Resolution — C29

**The extraction subject is 490 of 707 lines (69.3%), not 392 (55.4%).** All 98 move.
**Decided by: the user, 2026-07-31**, from three options with their measured consequences.

**What 490 counts, stated because two numbers are defensible.** It is the sum of §5.1's modules 1–7
source spans (**502**) minus `evictOldest` `:472-483` (**12**), which leaves `read_file.ts` too but
lands in `services/cache/` under §7's group B rather than in the `read_file.ts` extraction (group C).
So **502 of 707 (71.0%) leaves the file** and **490 of 707 (69.3%) is the `services/file-read/`
extraction**. Both were derived by summing the module spans; neither is `392 + 98`, which lands on
490 only by coincidence of scope — the corrected private-region baseline is 387, not 392, so the
naive arithmetic gives 485. **Quote 490 for group C and 502 for "how much logic leaves the handler."**
Raised by the Plan Challenge gate (§10, evidence audit) and it is right that the unqualified "490"
read as the second when it means the first.

**Rejected:**

1. **Honour §3's 392 literally; `handle()` stays at 175.** Cheapest, and it is what the document
   says. **Rejected because both instruments would then certify the file**: RFS-01's structural rule
   passes it, and `N` would have to be set near 210 to accommodate it, so the acceptance reading
   passes it too. The headline closes on paper with the orchestration still in `tools/`.
2. **Move the 58 logic lines, keep the 40 presentation lines** (result assembly + usage tips), on
   the parent's own four-way classification. **Rejected because AC-1's text names two allowed
   categories and this option needs a third**, so adopting it means amending AC-1 to permit
   presentation in `tools/` — a criterion relaxed to fit a result, which is the shape
   `validation.md` §14 was written to catch. It is also not obviously smaller: the result object at
   `:257-283` reads `metadata.language`, `metadata.symbols`, `metadata.imports` and both range
   objects, so keeping it in the handler keeps the handler coupled to four extracted modules'
   internals.

**AS-06's surviving leg survives, and is strengthened.** AS-06 sequenced PR-D after PR-C partly on
*"~390 lines of extraction including a security-sensitive containment check is too much to ride
along with the contract change itself."* At 490 that is more true, not less.

**Owed back to the parent `spec.md`** as **C29**, amending the Evidence row *"`read_file.ts` is
~55% domain logic (~390 of 707 lines)"* — measured **490 of 707, 69.3%**, with the private-method
count corrected 13 → 11 — and indexed in its *Design and Execute corrections* table alongside C28.
That edit is a PR-D task, landing with the work.

---

## 3. Specify §7.3 — **N = 125**

`spec.md` §7 item 3 requires N to be *"a **measured consequence** of the split, not a target the
split is shaped to hit."* It also supplies two inputs, and **neither reproduces**:

| §7 item 3 says | measured | verdict |
| --- | --- | --- |
| "103 lines of schema" | `inputSchema` is `:80-141` = **62**. No span in the file is 103; the closest is `:38-141` = 104 (interfaces + class decl + name/description + schema) | ❌ unsourceable |
| "35 of interfaces" | the interface block `:38-72` is **35** — but **21 of those 35 move with their code** (`ReadRange` 4, `FileMetadata` 9, `CachedFile` 5, plus blanks). Only `ReadFileParams` (14) concerns the retained surface, and §5 moves it too | ❌ double-counts |

### 3.1 Derivation

N is built from what **must** stay — the published schema and the `IToolHandler` members — plus an
allowance anchored on the four handlers already in this tree whose `handle()` is pure delegation.

**Irreducible**, byte-fixed by RFS-01's own acceptance reading (*"MCP `read_file` `inputSchema` +
REST `/file` response shape byte-identical"*):

| component | lines | why it cannot move |
| --- | --- | --- |
| `inputSchema` | **62** | published MCP contract; byte-identical is an acceptance criterion |
| `name` + `description` | **4** | `IToolHandler` members |
| `class` declaration + closing brace | **2** | — |
| **subtotal** | **68** | |

**Allowance**, anchored on measurement. `tools/` holds four handlers whose `handle()` body is
exactly 3 lines (`return this.run(params as XParams)`): `execute_file.ts`, `execute.ts`,
`batch_execute.ts`, `fetch_and_index.ts`. Their non-schema overhead (LOC − `inputSchema` LOC) is
**34 / 35 / 38 / 41**. Each includes a file docblock, 2 imports, a constructor, `name`/`description`,
class braces and 7–9 blank lines. `read_file.ts` provably needs more than any of them in exactly
two places:

| component | ≤ lines | basis |
| --- | --- | --- |
| file docblock | 10 | repo convention; must now point at the extracted modules |
| imports | 7 | 5–6 after extraction, against 9 today and 2 in the anchors |
| service field + constructor | 7 | `constructor(symbolGraph?: SymbolGraphService)` is a two-transport contract — §3.2 |
| delegating `handle()` | 20 | keeps its `try`/`catch` and the two error mappings that are the *handler's* own contract; the four anchors need 3 |
| blank lines | 13 | measured 7–9 in the anchors |
| **allowance** | **57** | |

**N = 68 + 57 = 125.**

**Deliberately not 120.** §6 sets a `handle()`-body ceiling of 120, and two different ceilings
sharing one number in one feature is how a reader conflates them. 125 keeps them distinguishable at
a glance.

**Falsifiability, both directions.** Above 125 → logic was left behind, and the acceptance reading
fails. Materially below ~100 → check that the schema was not altered, because 68 of the 125 is
schema and `IToolHandler` members. The bottom-up estimate of the retained file is **≈111**, so 125
carries **14 lines** of headroom. That is deliberate and it is calibrated against a recorded
near-miss: G-HUB's `maxFileLoc` sat at **696/700** through PR-C — four lines — and PR-B's T13
crossed its ceiling twice while writing prose that had to move into `tasks.md`.

### 3.2 One constraint on the retained surface that `spec.md` does not name

`ReadFileTool` is constructed at **20 sites**: `apps/tools-api/src/routes/file.ts:15` and
`apps/mcp-client/src/embedded-api-client.ts:181` — **both transports, both `new ReadFileTool(symbolGraph)`**
— plus 18 in tests (`read-file-containment.test.ts` 7, `read-file.test.ts` 7,
`wave-4-correctness.test.ts` 4). **The constructor's arity and parameter type are public surface**,
in R-06's class, and neither `spec.md` nor the parent names it. The extraction must keep
`constructor(symbolGraph?: SymbolGraphService)` exactly; the service is constructed *inside* it, not
injected through it.

Recorded here because the plausible tidy-up — *"the tool should take the service"* — breaks both
transports and 18 tests in a PR whose subject is elsewhere.

---

## 4. Specify §7.2 — delete the dangling exclusion, and close the class in the gate's **test**

**Decision:** delete `EXCLUSIONS`' `packages/core/src/services/query/prisma-client.ts` entry, and
add an existence assertion to the pinning test in `scripts/__tests__/check-coverage.test.ts`.
**Decided by: the user, 2026-07-31**, from three options.

### 4.1 C31 — the thirty-eighth plan defect: §7.2's premise is inverted, and its cost estimate is backwards

`spec.md` §7 item 2 states two things about `2ea4ebd`, and both are wrong:

> `2ea4ebd` fixed the *symptom* by **adding four lines of test** rather than repointing the entry,
> deliberately. […] making the array `git mv`-proof **is an edit to a gate**.

**Measured.** `git show 2ea4ebd --numstat`: **43 insertions, 1 file** —
`packages/core/src/__tests__/prisma-client.test.ts`, new, 2 `test()` blocks.
`scripts/check-coverage.ts` is **untouched** by that commit. The phrase *"four lines"* appears in
the commit message describing **the alternative it rejected** — repointing the `EXCLUSIONS` entry,
a 4-line diff. §7 read the rejected option's cost as the chosen option's size and inverted the two.

**And the class fix is not an edit to the gate.** The pinning test already exists:

```ts
// scripts/__tests__/check-coverage.test.ts:178
test("every excluded path is one the gate would otherwise measure", () => {
  for (const entry of EXCLUSIONS) {
    expect(isMeasuredSource(entry.file)).toBe(true);
  }
});
```

`isMeasuredSource` (`check-coverage.ts:379-388`) is a **pure string-shape predicate** — an extension
regex plus six substring/prefix checks. It contains no `existsSync`, no `readFileSync`, no
`statSync`, no `execSync`, no `git`. **It cannot touch the filesystem, so it can never see a
dangle**, and `"packages/core/src/services/query/prisma-client.ts"` passes it trivially. That is
why `test:scripts` stayed green through PR-C's T2b orphaning the entry — a *pinned invariant's
blind spot*, exactly as `spec.md` §7 says, but the remedy is one line in the **test**, not a rewrite
of the gate.

**C31 therefore changes what gets done**, not only what is believed: §7 framed the class fix as an
edit to a merge-blocking gate during the refactor that gate polices — the inversion of
*fix the subject, not the gate* — and priced it out on that basis. It is not that.

### 4.2 Measured state

**9 `EXCLUSIONS` entries. 1 dangling.**

| # | entry | tracked file exists? |
| --- | --- | --- |
| 1 | `packages/core/src/services/structural/query-pack-captures.ts` | ✅ |
| 2 | `packages/core/src/services/structural/grammar-loaders.ts` | ✅ |
| 3 | `packages/core/src/services/structural/native-node-helpers.ts` | ✅ |
| 4 | `packages/core/src/services/embeddings/providers/local-transformers.ts` | ✅ |
| 5 | `packages/core/src/services/embeddings/index.ts` | ✅ |
| 6 | `packages/core/src/services/health/local-health-checker.ts` | ✅ |
| 7 | `packages/core/src/services/query/prisma-client.ts` | ❌ **dangling** — at `kernel/` since `9fe4545` |
| 8 | `packages/shared/src/config/api-key.ts` | ✅ |
| 9 | `packages/shared/src/env.ts` | ✅ |

*(The first run of this sweep printed 8 rows against a stated total of 9 — a `while read` loop
dropped the last entry because the generated list had no trailing newline. Recorded because it is
the**truncated-population** trap firing inside this Design's own instrument, one measurement after
§0's. **Print the total before the rows** is what caught it.)*

**Delete rather than repoint.** `2ea4ebd` took `kernel/prisma-client.ts` from 88.46% (23/26) to
**100% (26/26)** with 2 real tests. The exclusion is now dead weight under either path, and
deleting it is the *close the gap, do not exclude it* answer; repointing it would re-exempt a file
that no longer needs exempting.

### 4.3 Options rejected

1. **Instance fix only — repoint the one entry.** One line. **Rejected**: the next `git mv` is
   silent again and the test still cannot see it, in a PR whose entire subject is `git mv`. It also
   re-exempts a file measured at 100%.
2. **Make `EXCLUSIONS` itself `git mv`-proof** — key entries by a content marker, or resolve them
   through `git log --follow`. **Rejected on scope**: a real class fix is wider than this file.
   The same defect shape is present at `scripts/capture-facade-baseline.ts:47` (`FACADE`, a literal
   path) and `:81` (`SELF_PATHS`, 4 literal paths), and at `scripts/version-sync.ts:67`
   (`EXTRA_VERSIONED_MANIFESTS`, 3 literal dotdir manifest paths, consumed at `:100`). All 8 of
   those resolve today. Closing the class properly means one mechanism across three scripts, which
   is its own change. **Logged in §9, not fixed here.**

### 4.4 The one implementation constraint

`EXCLUSIONS` entries are **repo-root-relative**, and `scripts/__tests__/check-coverage.test.ts`
imports no repo root — its only path constant is the synthetic `BASE = "/repo/packages/core"`.
`check-coverage.ts` has a real `REPO_ROOT` (used at `:619`). The added assertion must resolve
against that, not against the test's cwd, or it passes or fails for the wrong reason depending on
where `bun test` was invoked. **RFS-05 AC-4 closes with an observed red**: revert the deletion and
the test must fail.

---

## 5. The decomposition — where the 490 lines land

### 5.1 Modules

`spec.md` §4.3 fixed the destinations: a shared eviction **function** (§5.2 revises its home),
everything else into a new `services/file-read/`. Boundaries follow the state each function owns.

| # | module | contents (source spans) | ≈ LOC |
| --- | --- | --- | --- |
| 1 | `services/cache/lru-evict.ts` | `evictOldest` `:472-483` — a function taking `(cache, cap)`, **not** a class (§5.2) | ~25 |
| 2 | `services/file-read/path-containment.ts` | `checkPathContainment` `:387-448` + `resolveFilePath` `:350-385` | ~110 |
| 3 | `services/file-read/project-root-cache.ts` | `getProjectRoot` `:450-470` + `projectRootCache` + `ROOT_CACHE_TTL` + the `eventBus` subscription `:162-171` | ~50 |
| 4 | `services/file-read/file-content-cache.ts` | `readFileWithCache` `:518-580` + `fileCache` + `CACHE_TTL` + `FILE_CACHE_MAX_ENTRIES` + `interface CachedFile` `:68-72` | ~85 |
| 5 | `services/file-read/file-metadata.ts` | `extractMetadata` `:582-628` + `detectLanguage` `:645-681` + `extractImports` `:683-706` + `interface FileMetadata` `:58-66` | ~125 |
| 6 | `services/file-read/line-range.ts` | `calculateRange` `:485-507` + `adjustRange` `:509-516` + `extractLines` `:630-643` + `interface ReadRange` `:53-56` + `MASSA_AI_READ_FILE_MAX_LINES` `:22-36` + the N9 clipping `:235-249` | ~90 |
| 7 | `services/file-read/read-file.service.ts` | the orchestrator — `interface ReadFileParams` `:38-51`, the compression decision `:251-255`, result assembly `:257-283`, token math + recommendation `:285-322`, usage tips `:324-336`; composes 2–6 | ~120 |
| 8 | `services/indexing/execute-indexing.ts` | `index_project.ts`'s `executeIndexing` `:254-351` (`spec.md` §4.2) | ~110 |
| 8b | `services/project-identity/project-root-identity.ts` | `index_project.ts`'s **module-level** `canonicalizeProjectRoot` `:39-44` and `assertProjectRootReuse` `:46-68` — surfaced by C32's file-scoped rule, unnamed by `spec.md` §4.2 | ~35 |

**The module boundaries are not the dependency graph, and two edges cross them.** Named because the
table above reads as if each module stands alone and two of them do not:

- **2 → 3.** `checkPathContainment` `:415` and `resolveFilePath` `:373` both call `getProjectRoot`.
  One-directional — module 3 calls neither back — so no cycle, but module 2 cannot be constructed
  without module 3.
- **4 → 5, and it drags `SymbolGraphService` with it.** `readFileWithCache` calls `extractMetadata`
  at **two** sites, `:567` on a cache miss and `:555` on the legacy-entry cache-repair path; and
  `extractMetadata` reads `this.symbolGraph` at `:606` and `:610`. So the *cache* module must
  receive and thread through `symbolGraph: SymbolGraphService | undefined` purely to satisfy the
  *metadata* module. **Tasks must choose explicitly** — pass a `metadata` callback into module 4, or
  invert so module 7 calls 5 and hands the result to 4 — and record which, because the table above
  presents them as separable and they are not. Found by the Plan Challenge gate (§10, finding 3).

**Nine new files, and every one is under the DEBT-02 90% per-file floor.** `spec.md`'s **R-23**
says *"five or six"*; measured it is **nine**, and `scripts/` is **not** measured
(`isMeasuredSource` returns `false` for `scripts/check-tools-thin.ts`), so the gate script itself is
outside the floor. R-23 is corrected to nine and R-26's incentive pressure is scoped to these nine
files only.

**`services/file-read/` is not re-exported from `services/index.ts`.** Its only consumer is
`tools/read_file.ts`. Adding barrel re-exports would put six new names on `@massa-ai/core`'s
published surface for no consumer — the semver question RFS-04 exists to price, created gratuitously.

### 5.2 C30 — the thirty-seventh plan defect: the kernel rationale is falsified by the extraction it authorises

`spec.md` §4.3 admits the LRU to `kernel/` on this ground:

> the LRU is the one piece of the 392 lines that is genuinely two-tier (`tools/` + `services/`), so
> `kernel/`'s own admission rule — *"cross-cutting leaves … needed by two tiers"* — is met by it and
> by nothing else in the extraction.

**The premise is true today and false the moment the extraction lands.** `read_file.ts` is the only
`tools/`-tier LRU consumer, and modules 3 and 4 above move both of its caches into `services/`.
Consumers after PR-D, by tier:

| tier | LRU consumers |
| --- | --- |
| `tools/` | **0** |
| `services/` | **5** — `file-read/project-root-cache`, `file-read/file-content-cache`, `symbol/symbol-graph.service`, `web/web-controller`, `search/file-filter-cache` |
| `data/` | 0 |
| `kernel/` | 0 |

**The rule the roster actually keeps.** Every one of the 11 shipped `kernel/` modules serves **≥2
tiers**, measured over non-test importers with the §0 resolver: `alias-resolver` {data, services},
`db-connection` {data, kernel, services, +`packages/core/scripts/`}, `enum-validation`
{services, tools}, `fqn-codec` {data, services}, `identity-guard-installer` {data, services},
`lexical-search` {data, services}, `prisma-client` {data, services, +scripts}, `registry`
{kernel, services}, `schema-version` {kernel, services}, `search-diagnostics`
{data, services, tools}, `types` {kernel, services}. **11 of 11, no exception.**
`kernel/lru-evict.ts` would be the first admission serving exactly one tier — and
`check-core-layering.ts` enforces only **leaf-ness**, never two-tier-ness, so nothing in CI would
ever catch that or the next one.

**Resolution — C30: `services/cache/lru-evict.ts`.** **Decided by: the user, 2026-07-31.**
`services/cache/` already exists with 5 modules including `l1-memory-cache.ts` — which
`production-wiring.ts:67-68` already names in the same breath as the read_file cache. `kernel/`
stays at **11**, and its admission invariant stays 11 of 11.

**Rejected:**

1. **Hold `spec.md` §4.3 as written — `kernel/lru-cache.ts`, kernel 11 → 12.** **Rejected because
   the admission rule loses the only invariant it has**, silently and permanently: the tier's whole
   argument (`core-layering-controller-retirement/design.md` §1) is that membership is a *checkable
   property* rather than a list, and "needed by two tiers" is the property. An admission that
   breaks it converts the tier into an allowlist with a directory for a name — which is the option
   §1 of that document rejected.
2. **Keep it in `kernel/` and amend the admission rule** to something the LRU satisfies. **Rejected
   because it edits the contract text PR-C's GMS-01 AC-2 just froze to exactly two descriptions**
   (`CLAUDE.md:227` and `check-core-layering.ts`'s docblock), widening `kernel/`'s door inside a PR
   whose subject is `tools/`.

**§4.3's load-bearing half is untouched.** The module is a **function**, not a cache class — the
reason given there (`file-filter-cache` carries a TTL and no read-promotion; the others carry
read-promotion and no TTL; a shared class would impose one policy on all four and *would* be the
behavior change §3.B shows the eviction itself is not) does not depend on the destination. RFS-02
AC-2 is unaffected. **RFS-02 AC-3 changes**: *"`kernel/lru-cache.ts` imports nothing relative —
kernel leaf-ness is enforced by `check-core-layering.ts`'s clause 1"* no longer applies, because
`services/cache/` is not the kernel. The replacement property is that `lru-evict.ts` imports
**nothing at all** — it is a generic function over `Map<K,V>` — which is asserted by its own unit
test rather than by a tier rule. **That is a real loss of enforcement and it is recorded as such**,
not glossed: the kernel path would have had a CI clause behind it.

### 5.3 `services/file-read/` must not import `tools/`

`spec.md` §3.C names the constraint and it holds unchanged: `serializeToolResponse` is called once,
at `read_file.ts:338`, and **stays in the handler**. `tools/serialize.ts` is in the `tools/` tier;
any `services/file-read/` module importing it creates a `services → tools` edge, which is exactly
the class AC-5 was closed to eliminate and which `check-core-layering` fails on. RFS-03 AC-2 owns
it. The result object (module 7) is therefore built as a plain object and serialised by the
handler — one more reason the retained `handle()` is ~15 lines rather than 3.

### 5.4 What the extraction does to `tools → services`

`read_file.ts` holds **4** `tools → services` edges today (`compression/code-compressor`,
`events/event-bus`, `symbol/symbol-graph.service`, `workspace/workspace-manager`). After the
extraction it holds **2** (`symbol/symbol-graph.service` for the constructor's parameter type,
`file-read/read-file.service`), and the other two move down into `services/file-read/` as
`services → services`. `index_project.ts` holds 5 and is unchanged in count.

**All of these are legal in both directions** — `FORBIDDEN.tools` is `[]` — which is C28 restated:
`check-core-layering` reads `PASS` before, during and after. Its current baseline is
`PASS — 0 violation(s) across 965 tier-to-tier edges in 896 tracked files`. RFS-03 AC-1 records
`edgesExamined` per structural commit precisely because the pass/fail bit carries no information
here.

---

## 6. RFS-01's gate — the rule gains a third clause

**Decision: `check-tools-thin.ts` enforces three clauses, not two —
{no function body declared in the class other than `constructor` and `handle`; no `Map`/`Set`
instance state; `handle()` body ≤ 120 lines}, decided over a **TypeScript AST**, not a regex.**
The third clause was **decided by: the user, 2026-07-31**; the first clause's restatement from
*"no private method"* is **C32** (§6.5), forced by measurement.

### 6.1 Why the two-clause rule is not sufficient

`spec.md` §4.1 fixed the rule as *"{no private method, no `Map`/`Set` instance state}"*. Measured
against C29: **that rule passes a 175-line `handle()`**, so after PR-D merges the GMS-02 headline
can regrow through fat handler bodies with the gate green — the same blindness C28 disqualified
`check-core-layering` for, in its replacement. `N` (§3) constrains `handle()` for `read_file.ts`
alone and is a one-file acceptance reading, not a standing sensor.

### 6.2 The ceiling is a measured band, not a chosen number

`handle()` body LOC across the **27** of 30 `tools/` files that declare one — `serialize.ts`,
`serialize-interfaces.ts` and `index.ts` declare none:

```
175 read_file          90 compact_snapshot    43 get_index_status    3 batch_execute
128 index_project      90 get_analytics       39 list_projects       3 execute
113 impact_analysis    87 search_definitions  37 store_memory        3 execute_file
101 trace_path         74 get_references      34 get_optimized_ctx   3 fetch_and_index
 99 create_checkpoint  74 restore_checkpoint  30 search_project
                       61 list_checkpoints    28 search_code
                       59 search_memories     22 update_memory
                       52 compress_context    15 delete_memory
                       51 go_to_definition
                       49 get_architecture
```
min 3 · p25 28 · median 51 · p75 90 · max 175

Every integer ceiling from 90 to 130 was enumerated under strict `> ceiling`, and the boundaries are
where they are measured, not where they were expected:

| ceiling | files over | which |
| --- | --- | --- |
| 129–130 | 1 | `read_file` |
| **128** | **1** | `index_project` (128) is **not** `> 128` — the band's exclusive upper end |
| 121–127 | 2 | `read_file`, `index_project` |
| **120** | **2** | `read_file`, `index_project` |
| 114–119 | 2 | `read_file`, `index_project` |
| **113** | **2** | `impact_analysis` (113) is **not** `> 113` — the band's inclusive lower end |
| 101–112 | 3 | + `impact_analysis` |
| 99–100 | 4 | + `trace_path` |
| 90–98 | 5 | + `create_checkpoint` |

**Any ceiling in `[113, 128)` flags exactly the two files the body clause already flags.** 120 sits
in that band, with 7 lines of margin below and 8 above. Below 113 the gate pulls
`impact_analysis.ts` into PR-D's write set, which no requirement names and which **R-24** already
prices against; at 128 and above it stops seeing `index_project.ts`. **The band is measured; 120 is
a point inside it, and the band is the justification.** Chosen over its own endpoints for the same
reason §3 chose 125 over 111 — a value sitting on its own edge is a value that fails on the next
unrelated edit.

> **The first version of this table was wrong at both ends, and the Plan Challenge gate caught it
> (§10, evidence audit finding 1).** It stated the band as `(113, 128]` and gave the `113` row as
> **3 files over**. Both are off by one in opposite directions: under strict `>`, a `handle()` of
> exactly 113 is not over a ceiling of 113, and a `handle()` of exactly 128 is not over a ceiling of
> 128. **The cause is that the 113, 114 and 128 rows were interpolated from a measurement whose
> ceiling list was `…120, 110, 100…` — three rows that were reasoned into a table of measured ones,**
> and the reasoning used `>=` at one end and `>` at the other. *An operator is not a policy — read
> the call position*, one measurement after this feature recorded that rule, and this time inside
> the author's own table. The remedy is the enumeration above: every integer in the range, printed.
> **120 is inside the band under either reading, so no decision moves.**

**§4.2's rejection of a per-file LOC ceiling does not reach this.** That option was rejected because
*"any ceiling catching `index_project.ts` (352) also catches `tools/serialize.ts` (438), which is a
shared helper and not a handler."* **`serialize.ts` declares no `handle()`** and is therefore
untouched by a `handle()`-body clause. The distinction the file-level ceiling could not draw — a
handler from a helper — is drawn by the metric itself.

### 6.3 Rejected

1. **No third clause.** The gate stays two-clause; `N` alone constrains `handle()`. **Rejected** —
   see §6.1. This is the option that ships C28's shape one level down.
2. **Ceiling at 100.** Stricter, still closable by removal with zero allowlist. **Rejected on
   scope**: it adds `impact_analysis.ts` (113) and `trace_path.ts` (101) to PR-D's write set, and
   PR-D already carries six distinct changes (§7).

### 6.4 The gate's own instrument constraints — measured, not assumed

`spec.md` §3.A already records one instrument that was wrong before it was right (18 of 30 → 2 of
30, because a state-field pattern matched *interface members*). Three more, measured here:

1. **The `Map`/`Set` clause must be scoped to class-body and module-level declarations.**
   `tools/serialize.ts` contains `new Map<string, Bucket>()` at `:269` and `new Set<string>()` at
   `:274` and `:301` — all three **function-local**. A naive `new (Map|Set)` sweep over `tools/`
   flags a 438-line shared helper that `spec.md` §1 explicitly rules green on the merits. Same
   instrument class as §3.A's, one file over.
2. **Module-level cache state is a real evasion path and is absent today.** Measured: **0**
   `^(export )?(const|let|var) … = new (Map|Set|WeakMap|WeakSet)` across all 30 `tools/` files. The
   rule as stated in `spec.md` §4.1 says *instance* state, which would not see a module-level
   `const cache = new Map()`. Added to RFS-01 AC-5's fail-shape list.
3. **The object-literal-handler shape is absent.** All **27** files mentioning `IToolHandler`
   declare exactly one `export class`, and **0** files declare a `handle(` without a class. The
   three non-class files (`serialize.ts`, `serialize-interfaces.ts`, `index.ts`) are helpers and a
   barrel, declare no `handle(`, and must read green.
4. **The `handle()`-body measurement's robustness is currently unfalsifiable on this corpus, so a
   naive implementation could ship and only fail later.** A brace counter that strips strings,
   comments and template literals and a naive one that strips nothing produce **byte-identical**
   readings across all 27 files — because no `tools/` file today contains an unbalanced brace inside
   a string or a comment. **That is not evidence the metric is robust; it is evidence the corpus
   cannot test it.** C32's AST basis makes it moot for the implementation that ships, but a fixture
   whose `handle()` contains a string like `"unexpected token: {"` joins RFS-01 AC-5 so a future
   regex reimplementation fails rather than drifts. Found by the Plan Challenge gate (§10,
   finding 5).

### 6.5 C32 — the thirty-ninth plan defect: *"no private method"* is the wrong predicate, and taking it literally makes the rule unshippable

**Found by attacking §6.2 rather than by reading it.** The attack was: if a handler can keep
`handle()` at 3 lines by delegating to a method one call away, the ceiling is trivially evadable.
`execute.ts`, `execute_file.ts`, `batch_execute.ts` and `fetch_and_index.ts` all do exactly
`return this.run(params as XParams)` — so what is `run`?

```ts
// packages/core/src/tools/execute.ts:68-72
  private run: (params: ExecuteParams) => Promise<ToolResponse>;

  constructor(run: (params: ExecuteParams) => Promise<ToolResponse>) {
    this.run = run;
  }
```

**It is a `private` member whose *type* is a function and whose *value* is a constructor
parameter.** It declares no body — it is dependency injection, and these four are the thinnest
handlers in the tree. But it is `private`, and it is callable.

**Measured: 4 of 30 `tools/` files carry this shape** — `batch_execute.ts:63`, `execute.ts:68`,
`execute_file.ts:65`, `fetch_and_index.ts:76`. So a rule implemented as *"no `private` member that
is callable"* reads:

| rule as implemented | RED |
| --- | --- |
| flags function-typed private **fields** too | **6 of 30** — `read_file`, `index_project`, **and all four canonical thin handlers** |
| flags only declared **bodies** | **2 of 30** — `read_file`, `index_project` |

**At 6 the rule is unshippable without an allowlist, and RFS-01 AC-2 forbids one.** That is exactly
the feasibility cliff `spec.md` §3.A identified — *"at 18 the rule is unshippable without an
allowlist, and at 2 it is closable by removal"* — reached a second time by a different route, and
against the four files §3 uses as `N`'s own anchor.

**Resolution — C32: the predicate is a declared function body, not the `private` keyword — and its
scope is the file, not the class.**

> **In a file declaring a class that implements `IToolHandler`, no function body may be declared
> anywhere except inside `handle()`'s own.**

That single clause subsumes every shape RFS-01 AC-5 enumerates — a private method, a public method,
a getter or setter, a `static` member, a `#private` method, and an arrow-function class property —
because all six *declare a body*, while `private run: (…) => …` does not.

**The scope is the file for a reason the Plan Challenge gate found (§10, finding 1), and it is not
theoretical.** A class-scoped rule is defeated by a body declared one level out:

```ts
constructor() {
  const cache = new Map<string, string>();          // constructor-local, never `this.x`
  this.run = async (p) => { /* 490 lines, closes over cache */ };
}
async handle(p: unknown) { return this.run(p); }     // 3 lines
```

That passes all three clauses as class-scoped — no private *method*, no `Map`/`Set` *instance*
field, `handle()` at 3. It is also **not** any of AC-5's six shapes: "arrow-function class property"
means `private run = (x) => {…}`, a different AST node from a constructor-body assignment.
**Measured against the file-scoped rule it FAILS** — the arrow at the assignment site is a body
outside `handle()`. That fixture is added to RFS-01 AC-5.

A module-level `function doWork() {…}` called from `handle()` is the same evasion one level further
out, and the file scope closes it too. **`serialize.ts`, `serialize-interfaces.ts` and `index.ts`
are untouched** because none declares an `IToolHandler` class — which is what makes the file scope
shippable and is the distinction a per-file LOC ceiling could not draw (§6.2).

**Cost of the file scope, measured: two functions in one file PR-D already edits.** All 25 currently
green handlers read **0** bodies outside `handle()`. `index_project.ts` reads **3**, not the 1
`spec.md` §4.2 names: `executeIndexing` `:254-351` (98) plus two **module-level** exported helpers,
`canonicalizeProjectRoot` `:39-44` (6) and `assertProjectRootReuse` `:46-68` (23). The second throws
on a project-identity invariant — domain logic by any reading — and both are already imported by
`index-project-identity.test.ts` and `index-project-tool.test.ts`, so they move to
`services/project-identity/` with two import repoints and no test rewrite. **Closed by removal, zero
allowlist** — §4.2's own principle.

**And it must be decided over an AST, not a regex.** Three regex detectors were written while
measuring this section and **all three were wrong**, in three different ways, on the same tree:

| detector | miss |
| --- | --- |
| `^\s{2}private\s+…\s*[(<]` | read `private run:` as **not** a member — right verdict, wrong reason |
| arrow-property sweep `…= *(async )?\(` | **0** hits, while 4 function-typed private fields existed |
| the body detector written to replace both | found **8** of `read_file.ts`'s 11 methods and **0** of `index_project.ts`'s 1 — it truncates on multi-line signatures and on the generic `evictOldest<K, V>` |

**The per-file verdict survived all three; not one of the counts did.** `read_file.ts` and
`index_project.ts` read RED under every detector, so a "2 of 30" written from any of them would have
been accidentally right — and RFS-01 AC-3's frozen base reading is a **member-level** claim, not a
file-level one. *An instrument robust enough for the verdict is not thereby robust enough for the
baseline.* This is `spec.md` §3.A's lesson at one more level of resolution, and it is the fourth
instrument in this feature that was wrong before it was right.

**`typescript` 5.9.3 is already a root `devDependency` (`^5.4.0`), and
`scripts/verify-tree-sitter-grammars.ts` is the in-repo precedent for AST parsing in a gate.**
`ts.createSourceFile` decides all nine cases exactly — verified against a synthetic class covering
every shape:

```
false  PropertyDeclaration  run          <- private run: (p) => R      (injected, no body)
true   PropertyDeclaration  helper       <- private helper = async () => {…}
true   MethodDeclaration    m            <- private m<K,V>(…) {…}       (generic)
true   MethodDeclaration    multi        <- multi-line signature
true   GetAccessor          thing
true   MethodDeclaration    #hidden
true   MethodDeclaration    s            <- static
true   MethodDeclaration    handle       <- exempt by name
true   Constructor          constructor  <- exempt by kind
```

`check-core-layering.ts`'s hand-rolled `strip()` at `:120` is **not** the precedent to copy here: it
exists because that gate needs a per-offset *in-a-string* mask so an import statement written inside
a fixture string is not counted as an edge (C17). This gate needs member kinds and bodies, which is
what an AST is for.

**The rule as resolved reads `RED 2 of 30`** — verified by running it, not by reasoning about it:
25 handler files PASS with `bodies=0`, 3 files are `n/a` (no `IToolHandler` class), and the two RED
are `read_file.ts` (**13** maximal bodies outside `handle()`, 2 `Map` fields, `handle()` 175) and
`index_project.ts` (**3** bodies, 0 `Map`, `handle()` 128). The evasion fixture above reads **FAIL**
against the same run. *Name the metric*: an AST walk that descends into nested arrows reports **18**
for `read_file.ts` rather than 13, because `checkPathContainment` contains three one-line `.map`/
`.filter` arrows at `:423`, `:424`, `:440` and `extractLines` one at `:638-641`. **The baseline
counts maximal bodies** — a body not contained in another flagged body — and the reported number
must say which, or the frozen reading moves on a refactor that changes nothing.

**Owed back to the parent `spec.md`** as **C32**, amending `spec.md` §4.1's stated rule and §3.A's
population method, alongside C29–C31.

### 6.6 The properties the task must honour

1. **Frozen base reading before the first extraction commit** (RFS-01 AC-3), and **after `git add`**
   — the gate enumerates `git ls-files` exactly as `check-core-layering.ts:186` does, so its own two
   files are invisible to it while untracked. This has cost this feature twice already.
2. **The reading is `2 of 30` on the body/`Map` clauses and `2 of 27` on the `handle()` clause, and
   it is the same two files** — `read_file.ts` and `index_project.ts`. Record both, because a third
   clause that flags no file the other two miss is a clause whose contribution is unmeasured on this
   tree; its value is prospective and the record must say so.
   **Record it per member, not per file** — C32: every detector tried got the per-file verdict right
   and the per-member count wrong, so a file-level `2 of 30` is not evidence the instrument works.
   The baseline enumerates, by AST, **13 maximal bodies + 2 `Map` fields + `handle()` 175 in
   `read_file.ts`** and **3 maximal bodies + `handle()` 128 in `index_project.ts`**, each with its
   line span. The three regexes tried reported 8 / 0, 8 / 1 and 11 / 1 for those two files — all
   three RED, none right.
3. **The examined population printed on a PASS** (RFS-01 AC-1), on `check-core-layering.ts`'s
   `edgesExamined` precedent at `:277-281`: *"a check that resolved nothing also …"*.
4. **Both directions observed red, plus an inert control** (RFS-01 AC-4). The inert control is
   `serialize.ts` — 438 lines, three function-local `Map`/`Set` constructions, no `handle()` — which
   must stay PASS **while still being counted**.
5. **The gate is committed before it is wired to CI — but its unit suite is not "unwired", and the
   first draft of this property said otherwise.** A *script* not referenced by `ci.yml` cannot fail
   a build. Its *suite* can: `"test:scripts": "bun test scripts/__tests__ …"` **auto-discovers every
   `*.test.ts` under that directory** with no registration step, and `ci.yml:200` runs it inside the
   `build` job — one of `main`'s required checks. So the moment Phase 1 lands
   `scripts/__tests__/check-tools-thin.test.ts`, CI executes it. Found by the Plan Challenge gate
   (§10, finding 4).

   **The consequence is a precedent choice this repo has two live answers to, and Tasks must take
   the first:**

   | suite | basis | what it would mean here |
   | --- | --- | --- |
   | `check-core-layering.test.ts` | fully synthetic — every case builds a throwaway `mkdtemp` git repo so `git ls-files` is real but the corpus is not this tree | stays green across every phase |
   | `check-coverage.test.ts` | pins the **real** `EXCLUSIONS` array (this is what C31 is about) | a `2 of 30` assertion written at Phase 1 goes **red at Phase 3**, when `read_file.ts` becomes green |

   **Follow `check-core-layering.test.ts`: synthetic fixtures only, and no assertion about the live
   tree's count.** The frozen base reading is a record in `tasks.md`, not a test — PR-C's T0
   precedent, where the frozen `60 / 32 / 28` lives in the artifact and the gate's suite tests the
   function. A live-tree pin would also make §7's *"each phase independently green"* false.

   The `ci.yml` edit that invokes the script lands in the commit where it reads `0 of 30` — which is
   what *"ships with the restructuring, not after it"* means (GMS-01 AC-1's wording, PR-C's
   precedent).

---

## 7. Sizing — PR-D carries six changes, and the cut is Tasks'

`spec.md` **R-24** prices PR-D at five. Design adds a sixth (§1's rename) and grows a seventh
component (§6's third clause, inside an existing deliverable).

| group | write set, measured | new files |
| --- | --- | --- |
| **A. The gate** — `check-tools-thin.ts` + unit suite + `ci.yml` | 3 | 2 |
| **B. LRU unification** — `services/cache/lru-evict.ts` + 4 sites repointed + characterization | 5 + tests | 1 |
| **C. `read_file.ts` extraction** — 490 of 707 lines into 6 modules | 1 + 6 + 3 test files | 6 |
| **D. `index_project.ts`** — `executeIndexing` out, **plus the two module-level helpers C32's file scope surfaces** | 1 + 2 test files repointed | 2 |
| **E. The rename** — `services/graph/` → `services/memory-graph/` | **7** `git mv` + **19** editors / **28** lines (6 `mock.module`) + 3 prose + 9 fixture citations | 0 |
| **F. Vestigial sweep** (RFS-04) — `IHybridSearch`, `BatchCommand`, `data/vector/index.ts` | 3 + `package.json` surface checks | 0 |
| **G. The record** (RFS-05) — 6 stale statements, **C28–C32** into the parent, layer figures, `check-coverage` entry + its test, `CLAUDE.md` figures | ~8 | 0 |

**Nine new source files under the 90% per-file coverage floor** (§5.1), plus two under `scripts/`
which the floor does not measure.

**Read against the precedent, not against the count.** **R-25** is the number that matters: PR-C
planned 104 distinct files and shipped **222** (2.1×); PR-B planned 37 and surfaced **19** confirmed
plan defects. Design has already surfaced three (C29, C30, C31) before a line of code.

**Phase shape — each independently green, cheapest-and-most-separable first:**

- **Phase 0 — non-retroactive readings.** The three steps `spec.md` §10 sequences, plus the gate's
  frozen base (§6.5). Nothing structural moves.
- **Phase 1 — the gate.** `check-tools-thin.ts` + unit suite committed, **not** wired to CI.
- **Phase 2 — LRU.** `services/cache/lru-evict.ts`; 4 sites repointed. Behavior-preserving, proven
  by Phase 0's characterization tests passing **unmodified** (RFS-02 AC-1).
- **Phase 3 — the extraction.** 6 modules; `handle()` to delegation; `read_file.ts` to ≤ **125**.
- **Phase 4 — `index_project.ts`.**
- **Phase 5 — the gate goes green and is wired into `ci.yml`'s `build` job.** `0 of 30`.
- **Phase 6 — the rename.** Independent of every phase above.
- **Phase 7 — RFS-04 and RFS-05.** The record lands with the work.

**The cut decision is deferred to Tasks**, with the table above as its input — PR-C's precedent,
where the same question was resolved as *one PR, three phased commits* only once the per-task write
sets existed. Phase 6 is the obvious candidate cut point: it shares no file with Phases 0–5.

**R-04 applies to whatever cut is chosen.** Every phase above is independently shippable, and
`--no-ff` is required for the reason **R-27** gives — RFS-01 AC-3's frozen base is a claim about
**history**, and a squash makes ancestry and byte-identity unreconstructable.

---

## 8. Risks this Design introduces

| # | risk | why it is real | mitigation |
| --- | --- | --- | --- |
| R-28 | **The rename ships essentially ungated.** `check-stale-pointers` sees 1 of 19 files (§1.4) and 6 of the 28 edges are `mock.module` strings `tsc` cannot see | A missed `mock.module` specifier does not fail — the mock silently stops applying and the test runs against the real module. That is T13's collision class one step over | The acceptance reading is the **resolver sweep** (0 members, 0 resolvable importers of the old path), not a grep count — which would miss all 12 production edges. The 6 specifiers are enumerated in §1.4 so no task re-derives them |
| R-29 | **`lru-evict.ts` in `services/cache/` loses the CI-enforced leaf-ness the kernel path would have had** | RFS-02 AC-3 was written against `check-core-layering`'s clause 1. `services/cache/` is not the kernel, so no tier rule constrains its imports | AC-3's replacement property — *imports nothing at all* — is asserted by the module's own unit test. Weaker than a CI clause and recorded as such (§5.2), not glossed |
| R-30 | **`N = 125` has 14 lines of headroom over a bottom-up estimate of ≈111** | G-HUB sat at 696/700 through PR-C — four lines — and PR-B's T13 crossed its ceiling twice while writing the file | N is a **ceiling with a stated derivation** (§3.1) and the acceptance reading records the **actual**. If the actual lands materially below 100, the schema was altered and the byte-identity check is the thing that failed |
| R-31 | **`handle()` shrinking 175 → ~15 is the largest behavior-preserving rewrite in the PR, and the recommendation block has zero assertions anywhere** | Measured across the only four suites that exercise `ReadFileTool` (`read-file`, `read-file-containment`, `wave-4-correctness`, `e2e/08.search`) — see the table below | **Unit-level characterization of `:282-336` written before Phase 3**, and treated as new-test authorship, not verification. R-26 applies: these are exactly the tests that get written fast under a red coverage gate |

**R-31's first mitigation was false and the gate caught it (§10, finding 2).** This row originally
cited `packages/core/src/__tests__/test-seam/fixtures/read-file-response.json` as *"already pins the
shape."* **It is not a `ReadFileTool` response.** Its `data` keys are
`filePath, projectId, content, lineCount, startLine, endLine, symbols, imports, compressed`;
`handle()` returns `filePath, absolutePath, lineRange, source_clipped, metadata, compressed,
recommendations, content, tokens, compressionRatio`. Three keys overlap and none of the moving ones
do. Its consumer, `observation-extractor-seam.test.ts`, uses it as inert filler and **proves it** —
one of its own cases mutates the response shape and asserts classification is unchanged, because
`extractCategory` reads `tool_name`/`tool_input` and never the response. **That is the one artifact
in this document that was cited as evidence without being opened**, and it is the sharpest available
argument for re-deriving the rest.

What is actually characterized, per key, over those four suites:

| `handle()` segment | lines | assertions | verdict |
| --- | --- | --- | --- |
| N9 clipping `:235-249` | 15 | `source_clipped` in `read-file-containment` + `wave-4-correctness` | ✅ covered |
| result assembly `:257-283` | 27 | `lineRange` ×3 suites, `absolutePath` ×2, `metadata.language` ×3, `.symbols` ×2, `.imports` ×1, `compressed` ×1 | ✅ covered |
| compression decision `:251-255` | 5 | `compress: true` in 2 suites | ⚠️ reached, not asserted |
| token math `:285-322` | 38 | `tokens` ×1, `compressionRatio` ×1 — **both only `e2e/08.search`**, which needs a live PostgreSQL; `savingsPercent` **0** | ⚠️ e2e-only |
| **usage tips `:324-336`** | **13** | **`recommendations` — 0 files, in any of the four** | ❌ **unguarded** |

**The correct figure is not "56 of 98 uncharacterized"** — which is what a segment-level reading
gives — but **13 lines with no assertion anywhere plus 38 reachable only through an e2e suite the
default unit path does not run**. The five `recommendations.push` sites (`:282`, `:304`, `:318`,
`:326`, `:333`) and the four literal strings they emit are user-visible MCP output and are pinned by
nothing.
| R-32 | **The `services/graph/` rename touches `scripts/__tests__/check-coverage.test.ts`, the same file §4 adds an assertion to** | Eight fixture citations there (§1.4) name `src/services/graph/graph-queries.ts` | They are synthetic (`BASE = "/repo/…"`, never resolved), so no test breaks. Sequence Phase 6 after Phase 7's `check-coverage` edit, or accept one merge conflict in one file |
| R-33 | **A merge-blocking gate gains a `typescript` dependency** (§6.5) | `check-tools-thin.ts` runs in `ci.yml`'s `build` job, which is in `main`'s live `required_status_checks`. `typescript` is a **dev**Dependency (`^5.4.0`, resolved 5.9.3) | Precedented: `scripts/verify-tree-sitter-grammars.ts` already imports it and already runs in CI after `bun install`. The gate runs only in `build`, never in the Docker targets. **Pin the behaviour, not the version**: the unit suite must assert the nine member-kind classifications directly, so a `typescript` bump that changes them fails `test:scripts` rather than the gate |

**Inherited and unchanged:** R-04, R-07, R-20, R-21, R-22, R-26, R-27.
**R-23 is corrected: nine new files under the coverage floor, not five or six** (§5.1), and
`scripts/` is outside the floor, so §6's gate script is not subject to R-26's incentive.
**R-24 is corrected: six changes, not five** (§7).

---

## 9. Logged, not merged — additions to `spec.md` §6

| item | sites | why not here |
| --- | --- | --- |
| The path-keyed-list class beyond `check-coverage.ts` | `scripts/capture-facade-baseline.ts:47` (`FACADE`), `:81` (`SELF_PATHS`, 4 paths); `scripts/version-sync.ts:67` (`EXTRA_VERSIONED_MANIFESTS`, 3 paths, consumed at `:100`) | All 8 resolve today. A real class fix is one mechanism across three scripts — its own change (§4.3) |
| `data/symbol/` vs `services/symbol/` | 9 files vs 12 | A **tier** pair the layer contract already disambiguates (§1.3) |
| `.specs/features/wave-5-cross-pollination/{context,tasks}.md` cite `services/symbol/symbol-repository-pg.ts`; the file is at `data/symbol/` | 2 | Inside `check-stale-pointers`' `EXCLUDED`. Evidence the naming trap bites, not PR-D's to fix |
| `packages/core/src/services/SESSION-STATE.md` — a markdown file inside a source tier | 1 | Noticed while enumerating `services/` subdirectories. Not a layering violation and not measured further |

---

## 10. Plan Challenge record — full, two modes, 2026-07-31

Mode selection follows `spec.md` §9.1's precedent and the same guide: the domain maps to
**Architecture** (pre-mortem primary, red-team secondary) while the artifact carries ~60
quantitative claims, which maps to **Evidence Audit**. Both ran, read-only, independently, against
the standing instruction to **measure rather than reason**, and both were told what was already
found (C29–C32) so they would aim elsewhere.

**Pre-mortem / red-team — six findings, all six re-measured by the main agent before acceptance.
Five confirmed, one confirmed with its figure corrected. All six revised this document.**

| # | finding | severity | verdict on re-measurement | landed |
| --- | --- | --- | --- | --- |
| 1 | A class-scoped rule is defeated by a **constructor-body closure** — `const cache = new Map()` local, `this.run = async (p) => {…}`, `handle()` at 3 lines. Passes all three clauses and is none of AC-5's six shapes | **critical** | **CONFIRMED.** Written as a fixture and run: class-scoped PASS, file-scoped **FAIL** | **§6.5 rewritten** — the rule's scope becomes the **file**. Fixture added to AC-5. Surfaced 2 unnamed subjects in `index_project.ts` |
| 2 | R-31's cited mitigation is a **different tool's response**. `read-file-response.json` shares 3 keys with `handle()`'s output and none of the moving ones; its consumer proves response shape is inert | **critical** | **CONFIRMED**, and its figure corrected: *"56 of 98 uncharacterized"* is a segment-level reading. Measured per key, **13 lines have no assertion anywhere** (`recommendations`) and **38 are e2e-only** | **R-31 rewritten** with the per-key table; §11 item 4 re-scoped from verification to authorship |
| 3 | §5.1's boundaries are not the dependency graph: module 4 calls module 5 at **two** sites and must thread `SymbolGraphService` through a *cache* module | high | **CONFIRMED** — `:555` and `:567`; `extractMetadata` reads `this.symbolGraph` at `:606`/`:610` | **§5.1** gains both cross-module edges and hands Tasks an explicit choice |
| 4 | §6.6 property 5's *"committed but not wired cannot fail a build"* is false for the **suite**: `bun test scripts/__tests__` auto-discovers, and `ci.yml:200` runs it in `build` | high | **CONFIRMED**, and the two contradictory in-repo precedents reproduce (`check-core-layering.test.ts` synthetic vs `check-coverage.test.ts` live-array) | **§6.6 property 5 rewritten** — synthetic fixtures only; the frozen reading lives in `tasks.md`, not in a test |
| 5 | §6.2's band reproduces under both a careful and a **naive** matcher — so the corpus cannot falsify a naive implementation | medium | **CONFIRMED** — byte-identical readings; no `tools/` file has an unbalanced brace in a string or comment | **§6.4 item 4**; fixture added to AC-5 |
| 6 | Red-team: R-31 is the one claim stated confidently on an artifact never opened | — | Same as 2 | Folded into R-31 |

**What the gate got right that matters most.** Finding 1 is not a residual risk — it is a working
evasion of the gate PR-D ships to replace the one C28 disqualified, and C32 as first written did not
close it. Finding 2 is the only place in this document where an artifact was cited as evidence
without being opened, and it was cited as the mitigation for the largest uncharacterized rewrite in
the PR. **Both would have shipped.**

**Where the critic's figure did not hold.** Finding 2's *"56 of 98"* over-counts: `:235-249` and
most of `:257-283` **are** characterized, and `:251-255` and `:285-322` are reached by
`e2e/08.search`. The corrected reading is narrower and sharper — 13 lines guarded by nothing, 38
guarded only behind a live PostgreSQL. **Tenth time on this feature that a critic's mechanism held
while one of its figures did not**, and the second consecutive artifact where the author's figures
failed too (§0, §6.5).

**Two of the four pre-gate defects came from attacking this Design's own instruments**, which is
what both critics were told to assume about the rest: §0's fan-out sweep was wrong while carrying
both of PR-C's recorded pattern lessons, and §6.5 produced three consecutive wrong detectors on one
tree — each right about the verdict, none right about the count.

**Evidence audit — ~60 figures re-derived from raw data with independent parsers. Six do not
reproduce; all six re-measured by the main agent and all six confirmed. None reverses a decision.**

| # | figure | stated | measured | severity | landed |
| --- | --- | --- | --- | --- | --- |
| 1 | §6.2's ceiling band and its `113` row | band `(113, 128]`; `113 → 3 files` | band **`[113, 128)`**; `113 → 2`. Off by one at **both** ends: under strict `>`, 113 is not `> 113` and 128 is not `> 128` | medium | **§6.2 rewritten** — every integer 90–130 enumerated, and the cause recorded: the 113/114/128 rows were **interpolated into a table of measured ones** |
| 2 | §1.2's `services/symbol/` cost | 33 files / **64 edges** | **32** files / **63** edges / **90 import lines**. 64 was the *edge* count in a column headed *lines* | medium | **§1.2** now names all three metrics; §1.3 rejection restated at **90** — a *more* expensive rejected option |
| 3 | §2's `handle()` delegation split | "only **77** of them delegate" | **64** delegate, 98 do not, **13 structural** (`:174`, `:348`, 11 blanks). The 13 rows sum to **162**, not 175 | low-med | **§2** states all three; the table gains explicit sum / structural / total rows |
| 4 | §1.4's suffix-shaped importer | "only `services/symbol/graph-controller.ts`" | that file is **not among the 19 importers**. **4** of the 19 are stem-shaped — `memory-controller.ts` (suffix) and `search-facade-{hybrid,indexing,synapse}.test.ts` (prefix) | low | **§1.4** corrected, and the conclusion sharpened: the gate matches the **cited** filename, not the citing file |
| 5 | `MemoryRow as GraphMemoryRow` | `services/index.ts:131` | `:132`; `:131` opens the `export type {` block | low | **§1.1** corrected |
| 6 | R-25's `222` files / `19` defects | inherited from `spec.md` | **UNVERIFIABLE here.** `git show 2bea11e --stat` reports **229** — same neighbourhood, not a match; 222 is presumably a narrower population | — | Left as inherited, flagged in §9 rather than re-litigated |

**What the audit confirmed exactly**, and these are the decision-bearing ones: every `read_file.ts`
source span in §5.1; the 98-line non-delegation total; the full `handle()` distribution across all 27
files, re-derived with the critic's own parser; `bun scripts/check-core-layering.ts` at
`PASS — 0 violation(s) across 965 tier-to-tier edges in 896 tracked files`, byte-for-byte; the 20
`new ReadFileTool(` sites with their line numbers; the 9 `EXCLUSIONS` entries and the single dangle;
`2ea4ebd` at 43 insertions in 1 file; the 241 / 200 / 13 / 27 / 16 literal-sweep breakdown; the 11
`kernel/` modules; and `spec.md` §3.A's own `11 / 2` and `1 / 0` populations.

**The generalisable finding, and it is new to this feature.** Three of the six are the same shape:
*every hard span figure in a table is right while the table's own rows do not sum to its own stated
total.* §2's 162 ≠ 175 and §6.2's interpolated rows are both that, and neither is visible from
checking spans against source — only from checking the table against itself. **Added to this
feature's method: sum every table's rows and diff against its own total, even when each row has been
verified.** The audit also self-corrected twice while running (a `sed` mis-location and a
whitespace-stripping regex that returned a false 3 for module-level `Map`/`Set`), which is the same
class one level up.

`escalate_to_full` — already at full depth in both passes. `serious_findings: revise_plan` applied:
all twelve findings across the two modes revised this document rather than being appended to it.

---

## 11. Next action

**Tasks.** Its first input is §7's phase shape plus the cut decision left open there.

**Four things must be sequenced first inside Tasks, because none can be taken retroactively.** The
first three are `spec.md` §10's; the fourth is this Design's:

1. **RFS-01 AC-3's frozen base reading** — `2 of 30` on the body/`Map` clauses **and `2 of 27` on
   the new `handle()` clause**, recorded **per member** (§6.6 property 2), taken **after `git add`**,
   before any extraction commit.
2. **RFS-02 AC-1 and AC-4's characterization tests** on all four cache sites, including the
   `projectRootCache` rename pin, before the LRU moves.
3. **RFS-06 AC-1's three containment tests**, passing against the **pre-extraction** code, before
   the containment module moves and before `coverage` can turn "write tests" into "write tests
   fast" (R-26).
4. **R-31's `handle()` characterization gap** — **author** unit-level characterization for
   `recommendations` (0 assertions anywhere, 5 push sites, 4 literal strings) and for the `tokens` /
   `savingsPercent` / `compressionRatio` block (assertable today only through an e2e suite needing a
   live PostgreSQL), **before Phase 3**. This is new-test authorship, not verification of an existing
   fixture — the fixture cited for it is a different tool's response (R-31). It needs its own task
   line, not a bullet.
