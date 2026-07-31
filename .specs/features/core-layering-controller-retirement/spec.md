# Core Layering — Controller Retirement (PR-C) — Specify

- **Slug**: `core-layering-controller-retirement` · **PR-C**
- **projectId**: `massa-ai` · **workflowSessionId**: `spec-core-layering-controller-retirement`
- **Workflow**: spec-driven (Large — Specify → Design → Tasks → Execute)
- **Parent feature**: `core-layering-god-module-split`. GMS-01 and GMS-02 are **defined there**;
  this document does not restate them, it **scopes and amends** them for PR-C and records the
  measurements PR-C's Design starts from.
- **Predecessor**: PR-B (`core-layering-god-module-split`) — merged as **#53** (`fe1f30b`,
  `--no-ff`, two parents), released **v1.16.0** on 2026-07-31. Its GMS-03/04/05 verdict is
  `core-layering-god-module-split/validation.md` Part II.
- **Successor**: PR-D — `tools/read_file.ts` split (AS-06). **PR-C now hands it GMS-02 AC-1** (C13).
- **Status**: **Specify — in progress.** Design not started. No code written.

---

## 0. Why this is a separate directory

`core-layering-god-module-split/` holds the umbrella analysis (AS-01…AS-06, GMS-01…GMS-05) and
PR-B's execution record: 2573 lines of `tasks.md`, 461 of `validation.md`, all of it about
GMS-03/04/05. PR-C executes a **different** requirement pair against a **different** subtree, and
PR-B's own history shows what happens when two phases share one table — `STATE.md`'s duplicate
commit table drifted and was wrong for five tasks (see that file's T15–T19 row). One artifact set
per PR, cross-referenced, not merged.

---

## 1. Scope

**In:** GMS-01 (all six ACs) · GMS-02 **AC-2 only**.

**Out, and on the record as such:**

| item | owner | why |
| --- | --- | --- |
| `tools/read_file.ts` split — **GMS-02 AC-1** | **PR-D** | **C13, below** |
| `.ua/` regeneration (320 `rlm-` occurrences, 3 tracked generated artifacts) | after PR-D | GMS-04 AC-3 is not closed for them; PR-B did not claim it |
| `GraphController` / `TracePathTool` divergence | its own change — R-07 | unifying it is a **behavior** change |
| Full-corpus needles baseline | not scheduled | the 8-file / 14-needle corpus is not a repo-wide retrieval claim |
| Fusion/RRF weights, cache layers, retrieval tuning | parent `spec.md` Out of Scope | unchanged |
| `CLAUDE.md`'s stale "24 migrations" (tree has 23) | its own change | pre-existing, outside PR-C's write set — `validation.md` §15 finding 3 |
| `CLAUDE.md`'s "five packages" in *Recovering a half-released version* | its own change | **measured 8** publishable packages at v1.16.0 (§3) |

---

## 2. C13 — the twentieth plan defect, and how it was decided

**The contradiction.** `design.md` §11 assigns **GMS-01 and GMS-02** to PR-C. GMS-02's only
file-specific criterion is **AC-1**: *"`tools/read_file.ts` no longer holds logic that is not schema
validation or delegation."* But **AS-06** — an agreed decision, marked `y` — assigns that file to
**PR-D**, *sequenced after PR-C*, on the stated ground that *"~390 lines of extraction including a
security-sensitive containment check is too much to ride along with the contract change itself."*
**AS-05** independently sizes PR-C as *"layering + CI import check"* and PR-D as *"`read_file.ts`"*.

So as written, PR-C owned a requirement whose only concrete criterion is another PR's work. This is
the same shape as C10, C11 and C12: a criterion that cannot be satisfied by the change it governs.

**Resolution — C13.** GMS-02 **splits across two PRs**:

| criterion | owner | note |
| --- | --- | --- |
| GMS-02 headline — *no file under `tools/` contains orchestration or domain logic* | **PR-C + PR-D jointly** | neither PR closes it alone; PR-D closes it |
| **AC-1** — `read_file.ts` sheds non-schema/non-delegation logic | **→ PR-D** | AS-06 is an agreed decision with a stated rationale; AC-1 is the clause that yields |
| **AC-2** — a representative handler's behavior is unchanged, proven by tests written **before** the move | **PR-C** | **re-targeted**: the subject is a handler PR-C actually touches, not `read_file.ts` |

**Decided by: the user, 2026-07-31, in session.** Presented as three options with the measured
consequences of each.

**Options rejected, and why — recorded because `validation.md` §15 finding 2 says a bare
"Resolved" is the defect:**

1. **PR-C = GMS-01 only, GMS-02 wholly to PR-D.** Cleanest against AS-05/AS-06 and genuinely
   defensible. Rejected because PR-C must still edit **6** `tools/` files (they import
   `controllers/` — §3.E), and those edits would then ship under no GMS-02 criterion at all.
2. **PR-C absorbs `read_file.ts`, overturning AS-06.** Rejected on AS-06's own rationale, and
   because it pushes PR-C past the size AS-05 set while R-04 requires each PR independently
   shippable.

**The amendment is owed back to the parent `spec.md`**, indexed in its *Design and Execute
corrections* table as **C13**, in the same in-place style C1–C12 use. That edit is a PR-C task, not
a Specify action — it must land with the work, not ahead of it.

---

## 3. Premises, re-measured at the shipped tree

Every figure below was re-derived at `00ed280` (post-v1.16.0), not inherited from PR-B's record.
Method is named with each number, because three of these have quotable variants that disagree.

| premise | parent spec says | measured | verdict |
| --- | --- | --- | --- |
| `tools/read_file.ts` | 707 lines | **707** (`wc -l`) | ✅ holds |
| `tools/` file count | 31 tools | **31** `.ts` files | ✅ |
| `controllers/` members | 6 | **6** (`context`, `executor`, `graph`, `memory`, `search`, `index`) | ✅ |
| `controllers/` outside importers | 22 deep + 1 barrel + 1 dynamic = **24** | **24** | ✅ (see the glob trap below) |
| `data → services`, double-quote method | **24** lines / 14 files | **24 / 14** | ✅ |
| `data → services`, quote-agnostic | **26** / 16 / 7 (C7's recorded blind spot) | **26 / 16** | ✅ blind spot reproduces |
| `services → tools` | 4 edges, all `ToolError` | **4**, all `tools/enum-validation.js` | ✅ |
| `./controllers` exports subpath | present, **0** consumers | present at `package.json:28-31`, **0** | ✅ |

**A. The glob trap, named because it cost a figure.** Git pathspec `*` **crosses `/`**. So
`packages/core/src/*.ts` matches recursively and returned **23** files, while
`packages/core/src/**/*.ts` returned **22** — the latter silently drops the directory's own
top-level `index.ts`. The barrel (`src/index.ts:18`, `export * from "./controllers/index.js"`) is a
real importer and was missing from the first sweep. **Corrected: 22 deep + 1 barrel + 1 dynamic
= 24**, which reproduces C9 exactly. Any PR-C sweep over `src/` must state which of the two globs
it used.

**B. The `data → services` metric must be chosen, not inherited.** GMS-01 **AC-4 says 24**. The
quote-agnostic sweep says **26**. The two extra edges are real imports that the criterion's stated
pattern cannot see because it anchors on a double quote:

- `data/vector/base-vector-store.ts:14` → `services/embeddings/index.js`
- `data/vector/postgres-vector-store.ts:26` → `services/project-identity/identity-guard-installer.js`

Both single-quoted, both present at `a6216cd`, both unchanged at the shipped tree — **neither is a
PR-B regression**, and both belong to this group. **Recommendation for Design: adopt 26 / 16 files
as AC-4's referent and amend AC-4's "24" with its reason.** 24 is an artifact of the pattern, not a
property of the tree, and a contract that accepts 26 edges while its criterion counts 24 is a
contract with two edges nobody decided about. This is a **Design decision to record with its
rejected option**, not a Specify fiat.

**C. `services → tools` is genuinely a move, not a redesign.** All four edges import exactly one
symbol, `ToolError`, from `tools/enum-validation.ts` — `services/search/filter-validation.ts:25`,
`services/symbol/active-generation.ts:25`, `services/symbol/architecture.ts:17`,
`services/symbol/git-ref-validation.ts:15`. AC-5's framing holds.

**D. The published subpath is safe to remove.** `packages/core/package.json:28-31` declares
`"./controllers"` → `./dist/controllers/index.{d.ts,js}`. A repo-wide search for
`@massa-ai/core/controllers` returns **zero** consumers — the only hit is the parent spec's own
prose about it. Both transports import `ExecutorController` from the root barrel.

**E. The six `tools/` files that import `controllers/`** — these are GMS-02 AC-2's candidate
subjects, since PR-C must edit them anyway: `delete_memory.ts`, `get_optimized_context.ts`,
`search_memories.ts`, `search_project.ts`, `store_memory.ts`, `update_memory.ts`.

**F. The one dynamic importer** is `services/project-identity/production-wiring.ts:46`
(`await import("../../controllers/search-controller.js")`). `services/hooks/search-session-hook.ts`
is a plain **static** import — the parent `design.md` §5.1 called it dynamic and was wrong (C9
corrected the count; this records which file).

---

## 4. Gates PR-C inherits, and one it does not have

### 4.1 `check-stale-pointers` — pin **28**, exact

Measured green at `00ed280`: `PASS — 0 broken, historical exactly at its pin of 28`.

Three properties Design must not misread:

1. **The pin is `===`, not `<=`.** Ratcheting it is an explicit, reviewable edit. A citation
   *deleted* fails the gate just as a citation *stranded* does — that bidirectionality is the
   fourteenth plan defect's fix and must survive PR-C.
2. **`STEMS = ["rlm", "search-facade"]`.** PR-C moves `scripts/search-facade-{matrix,metrics}.ts`
   (**16** citations outside `EXCLUDED`, measured). If those citations are repointed with the move,
   they keep RESOLVING and **the pin stays at 28**. If they are not, each becomes a new HISTORICAL
   entry and the gate fails. **Keeping the pin at 28 is therefore the requirement**, not re-pinning.
3. **`EXCLUDED` = `CHANGELOG.md`, `.specs/`, `.ua/`, and the gate's own fixture file.** A clean
   reading says nothing about pointers inside those.

### 4.2 The gap — **`controller` is not a stem**

**PR-C's largest single move is invisible to the gate that exists to catch exactly this.** Measured
at `00ed280`: **61** `controllers/<file>.{ts,js}` path-shaped pointers outside `EXCLUDED`. Retiring
the directory strands every one that is not repointed, and `check-stale-pointers` will still report
`0 broken` and `historical exactly at its pin of 28`, because it never looks at them.

This is the **`fix the subject, not the gate`** situation inverted: the gate is not too strict, it
is aimed elsewhere. **Design owes a decision here**, and the two candidates are not equivalent:

- **Add `"controller"` to `STEMS`.** Cheap, reuses a tested instrument — but it re-baselines
  `HISTORICAL_PINNED` in the same change that moves the files, which is the one edit shape the pin
  exists to make visible. Needs the base reading taken **before** any move, on a frozen commit.
- **A PR-C-specific sensor**, on the T15/T17/T19 precedent, with its own discriminating red.

Either way, **the base reading must be captured on a frozen commit before the first structural
commit** — G-HUB could not be taken retroactively and neither can this.

### 4.3 `search-hub-metric` (G-HUB) — headroom is thin

Measured green at `00ed280`: every type ≤ 3 foreign reach, `maxFileLoc` **696** against the **700**
ceiling, largest file `contextual-search-rlm.ts`, 24 files in `services/search`.

**Four lines of headroom.** PR-C moves `SearchController` into `services/`, which is the direction
that consumes it. Note also that G-HUB's `maxFileLoc` reads **696** where `wc -l` reads **695** on
the same file — **name the metric when citing it**; a one-line disagreement is the difference
between "at the ceiling" and "over it".

### 4.4 Unchanged and expected to stay so

`check-frozen-anchors` exit 0 (14/14) · `check-characterization` exit 0 (3/3), all three guarded
behaviors at or above floor. Both measured at `00ed280`.

---

## 5. R-08's precondition — the gate on Design, not on Specify

`design.md` §5.3 is explicit and **still open**:

> PR-C's Design must answer *"where do cross-cutting modules live under the AS-01 contract?"*
> **before** it sizes itself.

Concretely: **does the layer contract gain a shared/kernel tier, or do those cross-cutting edges
enter the allowlist as accepted exceptions?** GMS-01 **AC-1's CI import check cannot be written
until this is answered** — the check must know whether `data → services/search/search-diagnostics.js`
is a violation or a legal reference to a shared module.

Two of the five cross-cutting modules sit inside PR-B's old directory and PR-B was **forbidden** to
touch them (`design.md` §5.4), precisely so PR-C would inherit the question intact:

- `services/search/search-diagnostics.ts` — 2 `data/` importers
- `services/search/lexical-search.ts` — 1 `data/` importer

**Specify does not answer this.** It is recorded here as the named precondition, and Design's first
deliverable is that answer, **with the rejected alternative written down** per §15 finding 2.

---

## 6. Acceptance criteria, as PR-C will be validated

GMS-01 AC-1…AC-6 **unchanged** from the parent `spec.md`, subject to §3.B's proposed AC-4
amendment, which Design must accept or reject explicitly.

GMS-02, **as amended by C13**:

- **AC-2 (PR-C)** — a representative `tools/` handler's behavior is unchanged, proven by tests
  written **before** the move and passing **unmodified** after it. Subject drawn from §3.E.
- ~~AC-1~~ → PR-D.

**Validation is independent — author ≠ verifier**, on PR-B's T20 precedent, and re-derives from raw
data rather than from `tasks.md` or this file.

---

## 7. Risks

| # | risk | mitigation | status |
| --- | --- | --- | --- |
| R-04 | **A squash destroys the commit history.** PR-B lost T6a/T6 to a squash via #46 and had to be renamed `-1b` to keep its tables unambiguous. **Measured 2026-07-31: PR #53 is the only non-squash in the last nine merges — #45 through #52 were all squashed.** The repo's default merge button is squash. | PR-C **must** be merged `--no-ff`, chosen deliberately, stated in the PR body | **Open — highest-likelihood process risk** |
| R-06 | The layering change breaks a transport | `ExecutorController` is imported directly by `apps/tools-api/src/routes/executor.ts` and `apps/mcp-client/src/embedded-api-client.ts`; AS-01 keeps its exported symbol name. `GraphController` is live via `routes/workspace.ts` — an earlier sweep called it dead and was wrong | Open |
| R-08 | PR-C is two changes wearing one label | §5's precondition, answered in Design **before** sizing | **Deferred to Design with a named precondition** |
| R-09 | **61 controller pointers strand silently** | §4.2 — a sensor decision owed in Design, with its base reading frozen before the first structural commit | **New, this document** |
| R-10 | **The release semantics are settled by default again** | PR-B's were: `### Changed` cut a minor for a behavior-preserving refactor, decided by the act of merging with zero PR comments. **PR-C must choose its CHANGELOG heading deliberately, before merge, and write down who chose and what was rejected** | **New, this document** |
| R-11 | `maxFileLoc` breaches 700 during the controller move | §4.3 — 4 lines of headroom; G-HUB must be run per structural commit, not once at the end | **New, this document** |

---

## 8. Method, carried forward from PR-B

Nineteen plan defects were confirmed across PR-B; **eleven were a correction that inherited the
defect it was correcting**. C13 above is the twentieth, found in Specify rather than in Execute.
The rules that produced that hit rate, kept verbatim:

- **Measure; do not infer.** Predict every sensor on paper, then confirm against the live tree.
- **Name the metric and name the flag.** Lines vs occurrences, `-E` vs `-P`, textual vs runtime,
  and now **git pathspec `*` vs `**`** (§3.A) have disagreed fourteen times on this feature.
- **Say whether a reading proves the work happened or only that nothing broke.**
- **Re-measure anything a subagent reports.** Seven consecutive critics: mechanism held, at least
  one figure or explanation did not.
- **A new sensor needs an observed red** before it is quotable.
- **Record who decided and the options rejected** — not `Resolved (reviewer, <date>)`. §2 is the
  first application.
- **Stop and ask rather than absorbing a contradiction silently.**

---

## 9. Next action

**Design.** Its first deliverable is §5's precondition — the cross-cutting-module answer — followed
by the §4.2 sensor decision and the §3.B metric decision. PR-C is **not** sized until all three are
recorded, each with its rejected alternative.
