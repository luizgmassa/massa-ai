# Core Layering and God-Module Split Specification

- **Slug**: `core-layering-god-module-split`
- **projectId**: `massa-ai`
- **workflowSessionId**: `spec-core-layering-god-module-split`
- **Workflow**: spec-driven (Specify → Design → Tasks → Execute)
- **Sizing**: Large. Behavior-preserving structural refactor across the whole of `packages/core`,
  plus a filename rename.
- **Status**: Specified; assumptions closed 2026-07-28; Design and Tasks complete.
  **PR-B complete** — merged as **#53** (`fe1f30b`, `--no-ff`), released **v1.16.0** on
  2026-07-31. **PR-C complete and validated** (`core-layering-controller-retirement`) — merged as
  **#59** (`2bea11e`, `--no-ff`, parents `450352b` + `2ea4ebd`), released **v1.17.0** on
  2026-07-31; **T18 PASS**, `core-layering-controller-retirement/validation.md`. **PR-D**
  (`core-layering-read-file-split` — `tools/read_file.ts`, AS-06, and GMS-02 **AC-1** by C13) is
  **in Specify**.
  **Twenty-seven corrections** have been applied to this document — twelve at PR-B's T19
  (C1–C12) and **fifteen at PR-C's T16 (C13–C27)** — see *Design and Execute corrections*
  below before trusting a criterion or a figure. **A twenty-eighth is owed and not yet written
  here: C28, raised in PR-D's Specify** (`core-layering-read-file-split/spec.md` §2) — **AS-06's
  stated sensor does not discriminate**. It lands with PR-D's work, not ahead of it, on the T16
  precedent. Three of this document's four layer-size figures are also stale after PR-C
  (**30 / 0 / 208 / 39**, plus `kernel/` **11**) and are corrected under the same task.
- **Depends on**: `sensor-repair-2026-07` (PR-A) must land and release first. Three of the gates
  this spec is validated by are unreliable until it does, and one — the needles gate — is
  *guaranteed* to report a false failure against this refactor. See the Evidence Corrections
  section.

## Evidence Corrections — read before trusting any number below

Four figures in the original Specify-only draft were re-derived from source at `a6216cd` and did
not hold. They are corrected in place throughout this document; they are listed together here
because two of them changed the plan.

| Original claim | Measured at `a6216cd` | Consequence |
| --- | --- | --- |
| `rlm-*` rename owns **40+ importers** across 12 files | **4 files** statically import an `rlm-*` module (2 source, 2 test). ~16 files mention the name at all, including 3 docs and one benchmark fixture. | The rename is roughly an order of magnitude cheaper than budgeted. **R-05 is retired.** |
| **38** backward imports | **36**, and the distribution is the finding: `data → services` **24**, `controllers → tools` **5**, `services → tools` **4** (all four importing only `ToolError` from `tools/enum-validation.ts`), `services → controllers` **3**. | The dominant layer violation has nothing to do with the controllers layer. AS-01 and the backward-import cleanup are **separate problems** and are now separate requirements. |
| fan-in **22** / fan-out **26** for `contextual-search-rlm.ts` | Does not reproduce under any single method: fan-in **24** static / **26** static+dynamic; fan-out **19** distinct module specifiers. | GMS-03 AC-3 as originally written was unmeasurable. Rewritten to pin the counting method first. |
| `tools → services` **34** | **Confirmed at 34**, but only as unique (tool-file → service-module) edges; the raw line count is 36. | Method must be stated whenever this number is used. |

Three findings surfaced during the same re-derivation that were not in the original draft:

- **`trace_path` and `impact_analysis` have two parallel implementations.** REST goes
  `apps/tools-api/src/routes/workspace.ts:461,612` → `GraphController`; the embedded MCP client
  goes `apps/mcp-client/src/embedded-api-client.ts:159,166` → `new TracePathTool()` →
  `tracePathService` directly, with its own parameter mapping. CLAUDE.md calls REST/embedded
  parity a tested contract. This is a latent behavior divergence, not a layering nit — and
  because it is a *behavior* finding it cannot be fixed inside a behavior-preserving refactor.
  Logged here; owned by its own change.
- **`ExecuteTool`, `ExecuteFileTool` and `BatchExecuteTool` are dead.** Exported from the barrel
  (`tools/index.ts:40,42,44`), zero `new` sites repo-wide. Both transports call
  `ExecutorController` directly instead.
- **`WebController` already lives in `services/`** (`services/web/web-controller.ts`) and is
  instantiated by both transports. The precedent for "an orchestrator that is not in
  `controllers/`" is therefore already set in the tree, which is evidence for AS-01's answer
  rather than against it.

## Design and Execute corrections (C1–C12) — applied at T19

`design.md` §10 accumulated corrections to this document from Design through Execute rather than
editing it piecemeal, so they could land as **one reviewed change**. T19 is that change. Each is
applied **in place** at the criterion or figure it amends, following the same convention as the
Specify-era table above; this index exists because **T20's verifier reads this document and must be
able to tell an amended criterion from an original one.** `design.md` §10 keeps the full rationale
for each — it is not restated here, so there is one copy to drift.

**Four of these replace an acceptance criterion rather than a figure** — C4, C10, C11 and C12. In
every one the criterion as written is unsatisfiable *by any tree this PR could produce*, so a
verifier checking it literally would mark it failed against a tree that satisfies what it meant.
The intent is preserved in each case; only the instrument changes.

| # | Amends | Kind | What changed |
| --- | --- | --- | --- |
| C1 | Status line · AS-02 | figure | `design.md` exists; AS-02's "Settled in `design.md`" was a forward reference in the past tense. **AS-02 stands.** |
| C2 | Evidence — member matrix | figure | `13 of ~16` facade members → **13 of 23**. `~16` had no method behind it. Not the `~16 files` figure, which is different and correct. |
| C3 | GMS-05 AC-4 note 3 | figure | ~90 minutes per observation → **~2 minutes locally**. 90 min was `needles-gate.yml`'s 2-core CI estimate. |
| C4 | GMS-04 AC-4 | **criterion** | The needles-fixture clause is obsolete — PR-A content-anchored all 14 needles and removed every `filePath`. Replaced by **FROZEN-ANCHOR** (`design.md` §6.1), a hard failure rather than a silent zero. Site count also **3 → 5**. |
| C5 | R-08 | figure | Rule of thumb **applied and passed** (0.5× / 2.3×, both under 3×) *and recorded as insufficient alone*. Status → **deferred to PR-C Design with a named precondition**. |
| C6 | R-03 | figure | Gains its falsifier: **G-HUB, calibrated on M14** — reach 1 → 14, members 26 → 24, host LOC 1668 → 463. M14 redistributed reach rather than widening the type. |
| C7 | Evidence table | figure | Adds `data → services` = **24 edges across 14 files**; the 12 elsewhere is the `getPrismaClient` subset and is correct. Records the double-quote blind spot (quote-agnostic: 26/16/7) for PR-C. |
| C8 | GMS-03 AC-3 · Evidence | figure | The two dynamic importers are `packages/core/src/scripts/{beir,symbol}-benchmark.ts:259/:214`. **The cited `scripts/…:258/:213` paths do not exist.** Count was right; citation was never checked. |
| C9 | R-08 | figure | `design.md` §5.1 named **two** dynamic `controllers` importers; there is **one**. Outside importers measured at **24**, settling §5.1's "~30" range. |
| C10 | GMS-04 AC-3 | **criterion** | `rg 'rlm-'` returning only CHANGELOG and `.specs/` is unsatisfiable — and was narrowed once before being replaced. Replaced by **`check-stale-pointers.ts` exit 0** at its pin. Population → pointer. |
| C11 | GMS-05 AC-4 note 2 | **criterion** | "per-needle ranks are unchanged" is unattainable for any PR renaming a corpus file. Replaced by **`needles-rename-control.ts` exit 0**, holding the file-path label constant. Intent unchanged. |
| C12 | GMS-03 AC-3 | **criterion** | "fan-in **and fan-out** both lower" fails on the shipped tree: fan-out **19 → 21**. Replaced by **`maxForeignReach` 14 → 1** plus D1 and fan-in; fan-out demoted to reported context. Added at T19 — the nineteenth plan defect. |

**C12 is the one added during T19 itself**, and it is worth stating why it is not special pleading.
The facade sheds **4** `rlm-*` delegate imports and gains **6** capability-module imports, so
fan-out rises by exactly the arithmetic of the decomposition; requiring it to fall would require the
split not to happen. Everything AC-3 exists to detect moved decisively the right way — reach
**14 → 1**, `delegateScope` **21 → 0**, facade-taking **15 → 0**, scoped LOC **1550 → 0**, fan-in
**24 → 23**. R-03's failure mode is a *facade*, and depth of reach is what tells one apart from a
set of capability modules; fan-out counts breadth, which a real split is supposed to increase.

## Design and Execute corrections (C13–C27) — applied at PR-C's T16

**PR-C confirmed fifteen further plan defects**, taking the running total across this umbrella
feature to **34**: nineteen in PR-B, of which twelve landed above as C1–C12, and these fifteen.
They are applied **in place** at the criterion or figure each amends, in the same convention as
the two tables above, and indexed here for the same reason — **PR-C's T18 verifier reads this
document and must be able to tell an amended criterion from an original one.**

The rationale for each lives once, in the artifact named in the last column:
`core-layering-controller-retirement/{spec,design,tasks}.md` for C13–C20, and the commit that
found it for C21–C27. It is not restated here, so there is one copy to drift.

**Seven replace an acceptance criterion or a remedy rather than a figure** — C13, C16, C18, C19,
C24, C26 and C27 all changed what would be *done*, not merely what was believed. Three of them
(C16, C18, C26) are the same section failing three different ways: R-09's remedy was first a
measured **no-op**, then as published a measured **regression**, then correct but resolving
against basenames and so unable to tell a live citation from a stranded one.

| # | Amends | Kind | What changed | Rationale in |
| --- | --- | --- | --- | --- |
| C13 | GMS-02 AC-1 | **criterion** | GMS-02 **splits across two PRs**. AC-1 (`read_file.ts` sheds non-schema logic) → **PR-D**, because AS-06 is an agreed decision that assigns that file there. AC-2 is **re-targeted** to a handler PR-C actually edits. The headline is closed by PR-C and PR-D jointly, by neither alone. | PR-C `spec.md` §2 |
| C14 | AS-01 · the kernel tier | figure | The kernel tier is **not implementable** without `data/db-connection.ts`: two of the six cross-cutting modules import it, so promoting them alone yields `data → kernel → data`. **AC-4 counts zero of its edges**, because it produces `services → data` and AC-4 counts the reverse — the criterion's direction is what hid the most cross-cutting module in the tree. Importers **14**, not 12; one is `packages/core/scripts/create-3072d-table.ts`, outside `src/`. | PR-C `design.md` §2 |
| C15 | GMS-01 AC-4 | figure | AC-4's referent **24 → 26** edges / **14 → 16** files. 24 is a property of a double-quote-anchored pattern rather than of the tree; both invisible edges are single-quoted, present at `a6216cd`, and neither is a PR-B regression. The check must be written quote-agnostic. | PR-C `design.md` §4 |
| C16 | R-09's remedy | **criterion** | Adding `"controller"` to `check-stale-pointers`' `STEMS` is a **measured no-op** — output byte-identical. `POINTER` interpolates each stem as a **prefix**, and every controller file is suffix-shaped: `controller-*.{ts,js}` = **0** files, `*-controller.{ts,js}` = **6**. R-09 would have been recorded closed over zero coverage. Replaced by a second alternation branch. | PR-C `design.md` §5.1 |
| C17 | `design.md` §3's own sizing | figure | Vector-store constructions **40 across 6 files → 39 across 5**. The sixth was `new PostgresVectorStore()` **inside a string literal** in another package, testing a pattern classifier. Going repo-wide fixed an undercount and added an overcount: a repo-wide sweep must also exclude string literals, comments and fixture text. | PR-C `design.md` §3 |
| C18 | `design.md` §5.2's snippet | **criterion** | The published regex tags only the **first** of two concatenated template segments. Untagged, `\.` collapses to a wildcard and **`\b` becomes U+0008**, so the whole alternation matches nothing — and because it is one expression it **kills the untouched prefix branch too**: `0 / 0 / 28`, **FAIL**. A code snippet inside a spec is untested code. | PR-C `tasks.md` §3.2 |
| C19 | GMS-01 AC-3 | **criterion** | `controllers/` carries **5** `→ tools/` imports of its own, and retiring the layer into `services/` **converts all five**, taking `services → tools` **4 → 9** across 3 symbols — including `validateEnum`, from the same file AC-5 empties. **AC-3 was owned by no task** while the kernel decision requires **zero** allowlist entries, so the five had neither a remover nor a place to be recorded. Closed **by removal** (T8b), not by exemption. | PR-C `design.md` §6 |
| C20 | R-11 | figure | R-11 names the wrong metric. Simulated: `maxFileLoc` **696 → 696**, *unchanged* by the controller move; what moves is `ContextualSearchRLM`'s **`maxForeignReach` 1 → 3** against a ceiling of **3** — a PASS with zero margin, on the axis C12 had already made GMS-03 AC-3's criterion. | PR-C `design.md` §7 |
| C21 | GMS-04 AC-3 · `check-stale-pointers` | figure | The gate reported `PASS — 0 broken` on a tree where a cited file **had already been deleted**. The blindness is in `STEMS`, not `EXCLUDED`, so no reshape of the exclusion list reaches it — and a moved module whose name carries no stem stays uncovered even after C16 and C26. | PR-C `376b19c`, `58772e7`, `9fe4545` |
| C22 | `design.md` §2's leaf-ness table | figure | Leaf-ness was judged at each module's **current** location, so same-tier siblings read as "none" and three modules the promotion drags along went unnamed: `types.ts` and `schema-version.ts` (T2), `registry.ts` (T3). §2's own row for `fqn-codec` names both blocking edges in the same breath as marking it a leaf. | PR-C `2c61641`, `58772e7` |
| C23 | `design.md` §3's roster | figure | `kernel/prisma-client.ts` is **absent from a six-row table headed "Admitted — 7 modules"**, and holds **12 of the 26** edges — more than twice any other target. T2b is a task the plan did not contain. `kernel/` ships with **11** modules against the roster's 6. | PR-C `9fe4545` |
| C24 | `design.md` §3's embeddings seam | **criterion** | §3 asserts both *"defaults to today's `createEmbeddingProvider` call"* **and** *"the allowlist for this group is empty"*. Mutually exclusive: an optional seam whose default **is** today's call keeps the import it exists to remove. Resolved by **throwing** rather than defaulting — the composition root moved instead. | PR-C `35f2874` |
| C25 | `tasks.md` §1's phase-2 sizing | figure | T8's write set is **18** importers, not 13. `validateEnum` has to move with `ToolError` — the file has two exports and no imports, so there is no partial move — and three `tools/` files appear **zero** times in `spec.md`, `design.md` or `tasks.md`. **13 is a correct count of the wrong population.** §1's phase-2 row also names no T8b file, and two of its three overlap rows are wrong. | PR-C `c2ebc56`, `57db658` |
| C26 | R-09's remedy, again | **criterion** | The reshaped gate resolves a token against a set of **basenames**, so it can see a controller citation but **cannot tell whether that citation still points anywhere** — a repointed file and a stranded one read identically. Given the directory, it caught a real stale citation at T11 and again at T12, both of which the basename gate read as `PASS`. Corpus narrows **142 → 137** and RESOLVES **114 → 109**; **HISTORICAL is unchanged at 28**, so the pin the narrowing does not touch is the one figure four artifacts quote. | PR-C `a98f76d` |
| C27 | `tasks.md` §4's gate lists | **criterion** | **T10 shipped a red `test:scripts`.** Two tests in `scripts/__tests__/search-facade-metrics.test.ts` settle a dispute by measuring the **live** `controllers/` directory, and went red the moment T10 relocated three orchestrators. **T10's gate list has eight entries and that suite is not among them** — T9 ran it at 998 pass, T10 did not run it at all. Found by running a gate the task in front of it did not require. | PR-C `a98f76d` |

**C26 and C27 are the ones found latest, and both by exhausting a check rather than by reading.**
C26 was found only because the remedy it corrects was patched and run against a mutated corpus —
the same method that found C16 one phase earlier, in the identical section, which is now three
remedies deep. C27 was found by running a suite outside the task's own gate list. Neither is
visible from the document that contains it.

## Why this exists

`audit-remediation-2026-07` deferred exactly three items to "their own spec" and named this one
as the owner of all three. This document closes that pointer so the deferral is a decision with
an address rather than a note in an Out of Scope table:

| Deferred by | Item | Recorded reason |
| --- | --- | --- |
| `audit-remediation-2026-07` Out of Scope | Controllers-layer restructuring (38 backward imports; `tools → services` 34× vs `tools → controllers` 6×) | "Behavior-preserving structural refactor. Needs its own risk budget and validation pass." |
| `audit-remediation-2026-07` Out of Scope | `contextual-search-rlm.ts` god-module split (fan-in 22, fan-out 26) | "Same. Also rewrites the exact files a `rlm-*` rename would touch." |
| `audit-remediation-2026-07` TASK-021 non-goal | `rlm-*` source/test filename rename (recorded as "12 files, 40+ importers"; actually 6 files renamed, 4 importers, ~16 files mentioning the name) | "Deferred to the god-module refactor, which rewrites those files. Renaming twice is churn for zero behavior change." |

## Problem Statement

`packages/core` states a four-layer architecture in `src/index.ts` and in `CLAUDE.md`:

```
tools/        thin MCP handlers — schema + delegation, no logic
controllers/  orchestration — composes services, owns side-effects
services/     domain logic
data/         persistence
```

The directory structure exists. The dependency direction does not hold, and the layer sizes say
so on their own: **31 tool files, 6 controllers, 208 services, 41 data modules.** Six controllers
cannot be the orchestration layer for 31 tools, and the import counts confirm what that shape
implies — `tools → services` occurs 34 times (unique tool-file → service-module edges) against
`tools → controllers` 6 times. The controllers layer is not a layer that is being bypassed
occasionally; it is a layer that was mostly never adopted. `tools/read_file.ts` is **707 lines**,
which is not a thin handler under any reading of the contract it is supposed to satisfy — a full
read classifies **~390 of those lines (55%) as domain logic**: path-containment security rules,
two LRU caches, line-range math, language detection and import-regex extraction.

The re-derivation sharpened this in a way the original draft got wrong. Only **3 of the 6
controllers hold anything the layer contract claims for them.** `MemoryController.store` publishes
a domain event and fires two background side-effects the underlying service does not
(`memory-controller.ts:164-171,184-186`); `SearchController.searchProject` emits `search:completed`
and `search:reranked` (`search-controller.ts:239-250,282-295`); `ContextController` genuinely
composes two controllers, a graph service, a compressor and a metrics singleton
(`context-controller.ts:120-171`). The other three do not: `GraphController` is a validate →
call-one-service → reshape wrapper that `tools/trace_path.ts:161` duplicates,
`ExecutorController.execute`/`executeFile` are 1:1 wraps whose only addition is error mapping, and
the barrel's `index.ts` is a re-export.

And the layer contract's biggest violation is not here at all. Of the 36 backward imports,
**24 are `data → services`** — mostly `getPrismaClient` from `services/query/prisma-client.ts`,
pulled in by 12 files under `data/`. Whatever happens to `controllers/`, that is the edge count
that dominates, and it is a different problem with a different fix.

Separately, `contextual-search-rlm.ts` has been split once already and is still the hub of the
search subsystem. Feature M14 took it from 1668 to 463 lines by moving implementations into five
`rlm-*` delegates. What that produced is a 461-line **facade** whose every public method is a
one-line forward to an `*Impl` function, over delegates that now total 2274 lines across six
files:

| File | LOC |
| --- | --- |
| `services/search/rlm-indexing.ts` | 591 |
| `services/search/rlm-search.ts` | 582 |
| `services/search/contextual-search-rlm.ts` | 461 |
| `services/search/rlm-fusion.ts` | 263 |
| `services/search/rlm-synapse.ts` | 252 |
| `services/search/rlm-admin.ts` | 125 |

The split moved code without moving responsibility: fan-in 22 / fan-out 26 is unchanged, because
every caller still goes through the facade and every delegate still takes the facade back as its
first parameter (`indexFileImpl(this, …)`, `searchImpl(this, …)`, `buildGraphStreamImpl(this, …)`).
The delegates are not modules with their own boundaries; they are the same object's methods stored
in other files. That is the specific thing this spec exists to finish, and it is why "M14 already
split it" is not an argument that the work is done.

Three pieces of evidence gathered while closing PR2 of `audit-remediation-2026-07` sharpen the
target and should not be re-derived:

- **T18 (oxlint adoption)** found dead imports still in `contextual-search-rlm.ts` after M14 and
  removed ~23 lines from it. Imports that no longer resolve to anything used are the residue of a
  split that moved code out without pruning what the departure left behind.
- **The facade's forwarding was almost entirely untested.** Under the DEBT-02 coverage gate the
  file measured **63.55%** line coverage, and the uncovered 78 lines were the delegation bodies
  themselves — the delegates had tests, the seam between them did not. A split whose seam nobody
  tested is a split whose contract nobody wrote down.
- **`48d0f39`** (PR1, out-of-band) showed the blast radius of that seam concretely:
  `contextual-search-rlm-coverage.test.ts` mocked four sibling factories but not
  `vector-store-factory.js`, so three tests constructed a real `PostgresVectorStore` and ran live
  embedding-provider auto-selection at 13.4 s cold. A class that reaches five factories to
  initialize is a class whose dependencies are not injected, and every test of it has to know all
  five.

## Goals

- [ ] The stated layer contract and the actual dependency direction agree, or the stated contract
      is changed to the one the code should actually have. Either outcome is acceptable; the
      current state — a documented contract that 34 imports violate — is not.
- [ ] `contextual-search-rlm.ts`'s responsibilities are separated so that its collaborators depend
      on the capability they use rather than on the whole object.
- [ ] `rlm-*` files carry names that describe what they do, renamed exactly once, in the change
      that already rewrites them.
- [ ] Behavior is preserved. This refactor ships no feature and fixes no bug.

## Out of Scope

| Item | Reason |
| --- | --- |
| Any behavior change, bug fix, or new capability | A behavior-preserving refactor that also changes behavior cannot be validated as either. Bugs found on the way are logged and fixed in their own change. |
| Performance work on the search path | Separate concern with its own measurement requirements. Fusion/RRF weights and the cache layers stay exactly as they are. |
| Database schema or migration changes | The persistence contract is not what is broken here. |
| The `services/` directory's own internal 208-file organization, beyond what the layer fix requires | Boundless otherwise. This spec addresses the layer contract and one named god module. |
| Splitting other large files by line count alone (`postgres-vector-store.ts` 910, `project-identity/apply.ts` 855, `symbol-graph.service.ts` 825) | Size is a symptom, not the finding. They enter scope only if the layering work shows they violate the dependency direction. Listed so a future reader knows they were considered. |
| Public MCP/REST tool contracts | 52 MCP tools and the REST endpoint map are published surface. Their schemas and endpoint templates do not change. |

---

## Assumptions & Decisions

All six opened as questions for Design. All six were closed by the spec owner on **2026-07-28**,
against the corrected evidence above. They are locked; re-opening one means revising this spec,
not arguing it during Execute.

| ID | Question | Decision | Confirmed? |
| --- | --- | --- | --- |
| AS-01 | Is `controllers/` adopted for all 31 tools, or retired in favour of a contract that matches reality? | **Retire the layer.** Codify `tools → services (some of which orchestrate) → data`. Move the 3 real controllers (Memory, Search, Context) into `services/` as named orchestrators; fold `ExecutorController` into `services/executor/` keeping its exported symbol name so the two transports that import it directly do not break; resolve the `GraphController` / `TracePathTool` duplication. Follows the `WebController` precedent already in the tree. Adoption was rejected on evidence: it is ~7-9 genuinely new orchestration controllers plus ~11 pure pass-throughs written as ceremony. | **y** |
| AS-02 | What replaces the `Impl(this, …)` delegation shape? | Capability modules owning only the state they use, with dependencies injected. Settled in `design.md` against the member→consumer matrix; the separable and shared members are already identified. **Confirmed at T19 — C1**: this was a **forward reference written in the past tense** — `design.md` did not exist when the sentence was drafted. It does now (§2's matrix, §4.4's module shape), the matrix it cites was built, and its statistics reproduce by direct re-derivation (`design.md` §1). **AS-02 stands as written.** | **y** |
| AS-03 | Does the `rlm-*` rename land in the same PR as the split, or after it? | **Same PR (PR-B).** The locked programme decision — rename exactly once, inside the change that already rewrites the files. Now near-free: 4 importers, not 40+. | **y** |
| AS-04 | How is "behavior preserving" proven? | Characterization tests first, then the structural change, per the repo's own precedent. The existing net is smaller than it looks — see GMS-05 AC-1. | **y** |
| AS-05 | One PR or several, and what is the intermediate state? | **Three PRs, plus a fourth for AS-06.** PR-A `sensor-repair-2026-07` (separate feature) → PR-B search split + rename → PR-C layering + CI import check → PR-D `read_file.ts`. Each independently shippable and revertable; every merge to `main` auto-cuts a release, so no PR may leave a contract holding nowhere. | **y** |
| AS-06 | Does `tools/read_file.ts` get split here, or its own change? | **Its own change, PR-D**, sequenced after PR-C so the CI import check PR-C adds is what proves the extraction landed. ~390 lines of extraction including a security-sensitive containment check is too much to ride along with the contract change itself. | **y** |

**Open questions: none.** `execute` moves to `true` when Tasks is written.

---

## Requirements

Stable IDs. Acceptance criteria are written to be checkable, but no criterion here has been
validated against an implementation — none exists.

### GMS-01 — The layer contract is true or corrected

The dependency direction stated in `packages/core/src/index.ts` and `CLAUDE.md` holds for every
import in `packages/core`, or both documents are updated to state the contract that is actually
enforced.

Per AS-01 the contract being made true is the corrected one: **`tools → services (some of which
orchestrate) → data`**, with `controllers/` retired.

**AC-1**: A deterministic check (import graph over `packages/core/src`) reports zero imports that
cross a layer in the disallowed direction, and that check runs in CI. It ships in PR-C alongside
the restructuring it validates — a check added after the fact proves only that the tree is
currently clean, not that the restructuring achieved it.
**AC-2**: `CLAUDE.md`'s Architecture section and `src/index.ts`'s header describe the same
contract the check enforces, with no third description anywhere. Both currently describe the
four-layer contract being retired, so both change in PR-C.
**AC-3** *(amended at PR-C's T16 — **C19**; the original counted **36** backward imports, which is
correct only for the tree before AS-01 runs. `controllers/` carries **5** `→ tools/` imports of its
own, and retiring the layer into `services/` converts all five, taking `services → tools` **4 → 9**.
The criterion had **no owning task** while the kernel decision requires **zero** allowlist entries,
so those five had neither a remover nor a place to be recorded. **Closed by removal, not by
exemption** — all five repointed at PR-C's T8b, group C back to **0**, allowlist still empty)*: Each
of the **36** backward imports and the **34** `tools → services` imports is either
removed or explicitly recorded as accepted, with its reason, in the check's own allowlist. The
counting method is stated with the number: backward = importing layer sits later than the imported
layer in the declared order; `tools → services` = unique (tool-file → service-module) edges, which
is 34 where the raw line count is 36.
**AC-4** *(amended at PR-C's T16 — **C15**; the referent is **26 edges across 16 files**, not 24.
The stated 24 is a property of a double-quote-anchored pattern rather than of the tree — the two it
cannot see, `data/vector/base-vector-store.ts:14` and `data/vector/postgres-vector-store.ts:26`, are
single-quoted, present at `a6216cd`, and neither is a PR-B regression. **The check must be written
quote-agnostic**, and PR-C's is. Closed by mechanism: the group reads **0** at PR-C's T4)*: The
`data → services` group — **24 of the 36**, dominated by `getPrismaClient` from
`services/query/prisma-client.ts` across 12 files under `data/` — is addressed explicitly and
separately from the controllers decision. It is the largest violation and it is unrelated to
AS-01; resolving AS-01 while leaving this unnamed would produce a "true" contract with 24 accepted
exceptions in it.
**AC-5**: `services → tools` (4 edges) is resolved by relocating `ToolError` out of
`tools/enum-validation.ts`, which is the only symbol any of those four imports. This is a move,
not a redesign.
**AC-6**: **`packages/core/package.json`'s `"./controllers"` exports subpath is removed or
repointed.** It is published npm surface — `"./controllers": { "types": "./dist/controllers/index.d.ts",
"default": "./dist/controllers/index.js" }` — and retiring the directory strands it pointing at a
`dist/` path that will no longer be emitted. It currently has **zero consumers**
(`rg '@massa-ai/core/controllers'` → 0 hits, in-repo and in both transports, which import
`ExecutorController` from the root barrel instead), so removing it is the cheap option; what is
not acceptable is leaving it dangling. `npm pack --dry-run` listing a path with no backing file
is the check.

### GMS-02 — `tools/` handlers are thin

No file under `packages/core/src/tools/` contains orchestration or domain logic.

**AC-1** *(re-assigned at PR-C's T16 — **C13**; **owned by PR-D**, not PR-C. AS-06 is an agreed
decision that assigns this file to PR-D *sequenced after PR-C*, on the ground that ~390 lines of
extraction including a security-sensitive containment check is too much to ride along with the
contract change; AS-05 sizes the two PRs the same way. As written, PR-C owned a requirement whose
only concrete criterion is another PR's work — the same shape as C10, C11 and C12)*:
`tools/read_file.ts` no longer holds logic that is not schema validation or delegation.
**AC-2** *(re-targeted at PR-C's T16 — **C13**; the subject is a handler the governing PR actually
edits, not `read_file.ts`. PR-C must edit **6** `tools/` files because they import `controllers/`,
and under the original wording those edits would have shipped under no GMS-02 criterion at all.
Closed at PR-C's T9, before the move rather than after it)*: A representative tool handler's
behavior is unchanged, proven by tests written **before** the move and passing unmodified after it.

**The GMS-02 headline — *no file under `tools/` contains orchestration or domain logic* — is closed
by PR-C and PR-D jointly, by neither alone.** PR-D closes it.

### GMS-03 — The search facade's collaborators depend on capabilities, not on the facade

No delegate in the search subsystem takes the facade instance as a parameter in order to reach
its dependencies.

**AC-1**: No `*Impl` signature in `services/search/` begins with the facade instance.
**AC-2**: A unit test of any single search capability can construct it without mocking five
factory modules — the `48d0f39` failure mode is structurally impossible. Note the sixth
dependency the original draft missed: `ensureInitializedImpl` builds `IndexManager` by direct
construction (`rlm-indexing.ts:586`), not through a `get*` factory, and `injectedDeps` has no
field for it — so it is the one dependency that cannot be injected today.
**AC-3** *(amended at T19 — C12; the original required fan-in **and fan-out** both lower, which the
shipped tree does not satisfy and a decomposition cannot)*: `contextual-search-rlm.ts`'s **coupling**
is lower after the change than before, **measured by scripts committed in PR-B and run at both
commits** — the frozen baseline is `d628464`, recorded in `facade-matrix-before.json` and
`facade-metrics-before.json` so it cannot drift with the tree:

| metric | script | before (`d628464`) | after | direction |
| --- | --- | --- | --- | --- |
| `maxForeignReach` on `ContextualSearchRLM` | D2 `search-hub-metric.ts` | **14** (by `rlm-search.ts`), exit 1 | **1** (by `search-warmup.ts`), exit 0 | **falls — the criterion** |
| foreign modules reading the facade | D2 | 6 | 1 | falls |
| `delegateScope` functions | D1 `search-facade-matrix.ts` | 21 | **0** | falls |
| functions taking the facade as a parameter | D1 | 15 | **0** | falls |
| LOC inside that scope | D1 | 1550 | **0** | falls |
| fan-in | D3 `search-facade-metrics.ts` | 24 static · 26 with dynamic | 23 · 25 | falls |
| fan-out | D3 | 19 distinct specifiers | **21** | **rises — reported, not a floor** |

**Fan-out is reported and is deliberately not a pass condition.** Measured cause: the facade sheds
**4** `rlm-*` delegate imports and gains **6** capability-module imports, net **+2**. A decomposition
that replaces one delegate with N modules necessarily raises distinct-specifier fan-out, so requiring
it to fall would require the split not to happen. Read a rise here as evidence the split landed, and
read `maxForeignReach` for the property AC-3 exists to protect — R-03's failure mode is a *facade*,
and depth of reach is what distinguishes one from a set of capability modules. Two dynamic
`await import(...)` sites are counted in fan-in throughout, at
`packages/core/src/scripts/beir-benchmark.ts:259` and
`packages/core/src/scripts/symbol-benchmark.ts:214` *(paths corrected at T19 — C8)*. The original
22 / 26 figures do not reproduce and are not the baseline. A before/after comparison is only
meaningful once the counting method is executable rather than described, which is why the scripts are
deliverables and not notes.

### GMS-04 — `rlm-*` files are renamed exactly once

The blast radius is roughly an order of magnitude smaller than the original draft budgeted: at
`a6216cd`, **4 files** statically import an `rlm-*` module (`contextual-search-rlm.ts`,
`rlm-search.ts`, `__tests__/rlm-indexing.test.ts`, `__tests__/graph-stream-project-scope-pg.test.ts`),
plus one test using `typeof import(...)` and `mock.module` targets
(`__tests__/contextual-search-rlm-coverage.test.ts`). Roughly **16 files** mention the name at all.

**AC-1**: No source or test file under `packages/core/src` is named `rlm-*`.
**AC-2**: Every importer is updated in the same commit as the rename; no compatibility re-export
file is left behind.
**AC-3** *(amended at T19 — C10; the original was `rg 'rlm-'` returns only CHANGELOG and `.specs/`
history, which is unsatisfiable and was narrowed once before it was replaced)*:
**`bun scripts/check-stale-pointers.ts` exits 0** — no `rlm-*` or `search-facade-*` pointer is
`BROKEN`, and the `HISTORICAL` count sits exactly on its pin (`HISTORICAL_PINNED = 28`). Counting the
string measures a *population*; the requirement was always about *a pointer that misleads a reader*.
The population cannot go to zero: **320** occurrences live in three tracked, generated `.ua/`
artifacts whose regeneration is deferred past PR-C, every extraction deliberately carries a
provenance comment naming the `rlm-*.ts` source it replaced (six files carry nothing else), and
`contextual-search-rlm-coverage.test.ts` carries `rlm-` in its own filename because §6 keeps
`contextual-search-rlm.ts` on purpose. Run the gate **after `git add`** — it enumerates
`git ls-files`, so an untracked file is invisible to it — and with full history, since it asks
`git log --all` whether a path ever existed. **Not under this gate, by design**: bare-word mentions
carrying no file extension (`` `rlm-admin` ``, a `describe("rlm-search — …")` title, an
`rlm-*.test.ts` glob). Do not read a green board as covering them.
**AC-4** *(amended at T19 — C4; the needles-fixture clause below was obsolete, and the site count was
short by two)*: The **five** non-source mention sites are updated in the same commit:
`docs/ONBOARDING.md` (3 places, including the layer-4 tour entry), `CLAUDE.md:157`, and — found at
T15, unnamed by the original — `packages/core/src/__tests__/architecture-map.test.ts:454-455` and
`packages/core/src/__tests__/search-controller.test.ts:3`, both comments citing test files this PR
renames.

**`benchmarks/needles/fixtures/massa-ai.json` is no longer a site.** The original made it the
critical one, because it pinned 4 needle targets to `services/search/rlm-fusion.ts` and
`services/search/rlm-search.ts` **by path**, and `benchmarks/needles/run.ts` skipped a missing target
with a `[warn]` and scored the needle zero — indistinguishable from a retrieval regression. PR-A
(`sensor-repair-2026-07` SEN-04) landed first as AS-05 requires: it content-anchored all 14 needles,
**removed every `filePath`**, and converted the silent skip into a hard failure. What replaces the
clause is constraint **FROZEN-ANCHOR** (`design.md` §6.1): four of the fourteen anchors sit inside
PR-B's blast radius **as content**, so moving those lines between files is safe but reflowing or
rewording them is not. The check is `bun scripts/check-frozen-anchors.ts` exiting 0 with all 14
anchors each resolving to exactly one location — a hard failure now, not a silent zero.

### GMS-05 — Behavior is preserved and proven so

**AC-1**: Characterization tests covering the seam exist and pass **before** any structural change,
and pass unmodified after it. The facade-forwarding tests added in `audit-remediation-2026-07` are
the starting point, and they are a smaller starting point than the 100% coverage number suggests:
of the 41 tests in `contextual-search-rlm-coverage.test.ts`, **24 assert forwarding only** —
`toHaveBeenCalledWith(rlm, …)` against a mocked `*Impl` plus a reference-identity return — and 17
exercise real behavior, covering just **6 of the 21 delegate surfaces** (`filterByPatterns`,
`clearProjectIndex`, `getProjectStats`, `warmupCache`, `getAnalytics`, `ensureInitialized`). A
forwarding test proves the wrapper is a byte-exact pass-through and proves nothing about what the
delegate does; after the refactor removes the wrapper it protects nothing at all. Before any
structural commit, the characterization inventory must be completed across
`rlm-indexing.test.ts`, `rlm-search.test.ts`, `rlm-synapse.test.ts`, `rlm-admin.test.ts` and
`contextual-search-rlm.characterization.test.ts`, and the gaps closed. **Coverage percentage is
not evidence for this criterion** — the facade sat at 100% line coverage with 24 of its 41 tests
unable to detect a behavior change.
**AC-2**: The DEBT-02 coverage gate passes at or above its floor for every file this work touches,
with no new exclusion added to `scripts/check-coverage.ts`.
**AC-3**: No test is weakened, skipped, or deleted to accommodate the refactor. Any test that must
change is a behavior change and therefore out of scope.
**AC-4**: `bun run lint`, `bun run type-check`, `bun run build`, `bun run test`, `bun run test:scripts`
and `bun run test:plugins` are green, and the needles retrieval gate holds its floors
(`NEEDLE_FLOOR_HIT1=0.5`, `NEEDLE_FLOOR_MRR=0.65`) — a search refactor that silently degrades
retrieval quality would otherwise pass every other gate.

The needles clause carries three conditions the original draft did not state, and without them it
is not satisfiable:

1. **It requires PR-A.** With the positional fixture, moving the 7 `services/search/` needle
   targets caps `hit@1` at 7/14 = 0.50 and `MRR` at 0.50 against a 0.65 floor — a guaranteed
   failure independent of retrieval quality. The gate is readable only after SEN-04.
2. **It is a before/after comparison, not a single run** *(amended at T19 — C11; the original made
   the evidence "per-needle ranks are unchanged", which this PR does not satisfy and no PR renaming a
   corpus file can)*. The floors are a backstop; the evidence is
   **`bun scripts/needles-rename-control.ts` exiting 0** — no needle below its baseline rank **once
   the file-path label is held at its baseline value**. The note's intent is unchanged and still
   enforced: a run that clears the floor while quietly losing three needles from rank 1 to rank 4 is
   a regression that passed. Only the claim that *raw* rank equality is achievable is corrected.
   Why it is not: `smart-chunker.ts:62-70` prepends `// File: <relativePath>` to every chunk before
   it is embedded, plus a `// Section: <label>` line — the enclosing symbol's name — repeated three
   more times. Both are naming, both enter the embedded text, and rank is a function of the cosine
   score computed over that text, so renaming a file or de-facading a symbol perturbs every score in
   it and two adjacent chunks can swap. Measured at T17: `N05-centrality-rerank-bonus` went rank
   **5 → 6** while its target chunk's own top score was *byte-identical*, because a rival overtook it
   across a **0.0134** margin. **`scripts/needles-diff.ts` therefore exits 1 on this tree and that is
   expected, not an open regression** — read the per-needle table it prints, not its exit code.
3. **Each observation costs roughly 2 minutes locally and a local Ollama** *(amended at T19 — C3;
   the original said ~90 minutes)*. 90 min is `needles-gate.yml`'s **2-core CI** estimate at ~60 s
   per embed with qwen3-embedding:8b, which was carried into a local-cost table by mistake and
   falsified in PR-A. The CI workflow stays `workflow_dispatch`-only and `continue-on-error: true`
   for that reason; locally the runs are cheap. `needles-rename-control.ts` is the exception at
   **~3.5 min**, because it embeds the corpus twice.

---

## Risks

| ID | Risk | Why it is real here | Status |
| --- | --- | --- | --- |
| R-01 | A behavior-preserving refactor silently changes retrieval quality | **Restated — the original had it backwards.** The needles gate is not a sensor that might miss a regression; as built it is a sensor that manufactures one. 7 of 14 needles are pinned by `filePath` + line range into `services/search/`, and `run.ts:233-236` scores a moved target as zero behind a `[warn]`. Retired by PR-A (SEN-04); until then the refactor has **no** retrieval sensor at all. | Open — owned by PR-A |
| R-02 | The refactor is validated against tests written after the change | Tests written from the new shape cannot detect that the old shape did something else. Sharpened by evidence: 24 of the facade's 41 existing tests are forwarding-only and will protect nothing once the wrapper they assert is removed. GMS-05 AC-1 owns this. | Open |
| R-03 | Splitting again produces another facade | M14 already did one split that preserved fan-in/fan-out exactly. Repeating the same move is the default failure. GMS-03 AC-3's committed measurement scripts are the check that would catch it. **Falsifier added at T19 — C6: G-HUB (`search-hub-metric.ts`), calibrated on M14** — across M14 `maxForeignReach` went **1 → 14** and `members` **26 → 24** while host LOC fell **1668 → 463**. Note the direction: M14 did *not* widen the type, it **redistributed reach**, which is exactly why a fan-in/fan-out reading called that split a success and G-HUB calls it a failure. Depth of reach is the discriminator, and it is why C12 makes `maxForeignReach` AC-3's criterion and demotes fan-out to reported context. | Open — PR-B has not shipped |
| R-04 | The intermediate state is unshippable | Merging to `main` with green CI auto-cuts and publishes a release. Every one of PR-A..PR-D must be independently shippable. AS-05's four-PR boundary is the mitigation. | Open |
| R-05 | The `rlm-*` rename collides with in-flight work | **Retired.** Premised on 40+ importers; the measured figure is 4. A concurrent branch touching search conflicts in at most a handful of files. | Retired 2026-07-28 |
| R-06 | The layering change breaks a transport | New. `ExecutorController` is imported directly by `apps/tools-api/src/routes/executor.ts:13,17` and `apps/mcp-client/src/embedded-api-client.ts:43`, so it is public surface despite living in `controllers/`. AS-01 keeps its exported symbol name for exactly this reason. `GraphController` is likewise live via `routes/workspace.ts:461,612` — an earlier sweep called it dead code and was wrong. | Open |
| R-07 | The `GraphController` / `TracePathTool` divergence is fixed by accident | New. REST and embedded reach `trace_path`/`impact_analysis` through two implementations with separate parameter mapping. Any tidy-up that silently unifies them is a **behavior** change inside a behavior-preserving PR, and would be validatable as neither. It must be left alone here and fixed in its own change. | Open |
| R-08 | **PR-C is two changes wearing one label** | Raised by the Plan Challenge critic and confirmed. **Rule of thumb applied and passed at T19 — C5**: 0.5× on files-touched and 2.3× on files-moved-vs-edited, both under the 3× agreed below — *and recorded as insufficient on its own*, because the group is two problems rather than one (`design.md` §5.2), so passing the ratio does not settle the framing. **Its premise is corrected — C9**: "Retire the controllers layer touches 3-4 files" is ~an order of magnitude low. Measured: 6 members and **22 deep + 1 barrel (`src/index.ts`) + 1 dynamic = 24** outside importers, against `design.md` §5.1's "~30" and "between 22 and 30" — which settles the range rather than narrowing it. §5.1 also named **two** dynamic `controllers` importers; there is **one** (`production-wiring.ts`), since `search-session-hook.ts:21` is a plain static import. Both figures are pinned by `scripts/__tests__/search-facade-metrics.test.ts`, not left as prose. GMS-01 AC-4's `data → services` group is **24 edges across 14 files under `data/`** (the "12 files" this row carried is the `getPrismaClient` subset, not the group — C7), is unrelated to AS-01, and carries its own risk. AS-05 sized PR-C on the controllers move alone. | **Deferred to PR-C Design with a named precondition** (`design.md` §5.3) |

---

## Evidence

Re-derived at `a6216cd` (v1.9.0, `main`) on 2026-07-28 unless noted. Rows marked **[re-derived]**
replace a figure from the Specify-only draft that did not hold; rows marked **[new]** were not in
that draft. Every number was read from current source, not inferred and not carried forward.

| Claim | How it was measured |
| --- | --- |
| tools 31 / controllers 6 / services 208 / data 41 | `find packages/core/src/<layer> -name '*.ts' \| wc -l` — unchanged, confirmed |
| `tools → services` 34× vs `tools → controllers` 6× | `rg -n 'from "\.\./services'` over `tools/*.ts`, deduped to unique (tool-file → service-module) edges; raw line count is 36 **[re-derived — 34 confirmed, method corrected]** |
| backward imports **36**, not 38: `data → services` 24, `controllers → tools` 5, `services → tools` 4, `services → controllers` 3 | `rg` for `from "(\.\./)+<layer>/"` plus dynamic `import(...)` across `services/`, `data/`, `controllers/`. One of the 3 `services → controllers` edges is dynamic (`services/project-identity/production-wiring.ts:46`) and is invisible to a static grep **[re-derived]** |
| `data → services` is **24 edges across 14 files**, over **6** target service modules | **Added at T19 — C7**, and the metric is named because three figures here are quotable and different: at `a6216cd`, `git grep -nE 'from "(\.\./)+services/'` over `packages/core/src/data/**/*.ts` returns **24 matching lines**, **24** unique (data-file → service-module) edges and **14** distinct files. The **12** this document cites elsewhere is the `getPrismaClient` subset alone and is **correct, re-confirmed at 12** — it is not the group total. **The stated method has a blind spot, found at T19 and left for PR-C**: the pattern anchors on a **double quote**, so a quote-agnostic sweep (`from ["'](\.\./)+services/`) returns **26 edges / 16 files / 7 modules**. The two extra sites are `data/vector/base-vector-store.ts:14` → `services/embeddings/index.js` and `data/vector/postgres-vector-store.ts:26` → `services/project-identity/identity-guard-installer.js`, both single-quoted, both present at `a6216cd` and unchanged at the shipped tree — so neither is a PR-B regression, and both belong to **GMS-01/PR-C**, which owns this group |
| fan-in 24 static / 26 with dynamic; fan-out 19 distinct specifiers | `rg -l "from ['\"][^'\"]*contextual-search-rlm"` for fan-in, plus the two `await import(...)` sites — **`packages/core/src/scripts/beir-benchmark.ts:259` and `packages/core/src/scripts/symbol-benchmark.ts:214`, paths corrected at T19 (C8)**; `rg -o "from \"...\"" \| sort -u` for fan-out. A plain-string grep returns 37 files and overcounts — 13 are comments, fixture paths and `mock.module` targets **[re-derived — 22/26 does not reproduce]**. This row was cited as `scripts/{beir,symbol}-benchmark.ts:258/:213` and recorded as *"both, confirmed"*; **neither path exists** — the count was right (24 + 2 = 26) and the citation was never checked against the filesystem. The real paths and their line numbers are now pinned by `scripts/__tests__/search-facade-metrics.test.ts`, so this correction ships under `test:scripts` rather than as prose |
| `rlm-*`: 4 static importers, ~16 files mentioning the name | `rg -l "from ['\"][^'\"]*rlm-(indexing\|search\|fusion\|synapse\|admin)"` and `rg -l 'rlm-' -g '!node_modules' -g '!.specs/**' -g '!CHANGELOG.md'` **[re-derived — "40+ importers" is wrong by ~an order of magnitude]** |
| `rlm-*` LOC table | `wc -l` over `packages/core/src/services/search/{contextual-search-,}rlm-*.ts` — unchanged, confirmed |
| 3 of 6 controllers hold real orchestration | read of all six; events at `memory-controller.ts:164-171,184-186` and `search-controller.ts:239-250,282-295`; composition at `context-controller.ts:120-171` **[new]** |
| `GraphController` is live, not dead | `apps/tools-api/src/routes/workspace.ts:16,94-96,461,612`, plus its own 380-line `__tests__/graph-controller.test.ts`. An automated sweep reported it as having zero importers; that was wrong and was caught before it reached this document **[new]** |
| `trace_path`/`impact_analysis` have two implementations | REST `routes/workspace.ts:461,612` → `GraphController`; embedded `embedded-api-client.ts:159,166` → `new TracePathTool()` → `tracePathService` **[new]** |
| `ExecuteTool`/`ExecuteFileTool`/`BatchExecuteTool` are dead | exported at `tools/index.ts:40,42,44`; `rg 'new (ExecuteTool\|ExecuteFileTool\|BatchExecuteTool)\('` → zero matches **[new]** |
| `WebController` lives in `services/` and both transports use it | `services/web/web-controller.ts`; `routes/web.ts:34-35`, `embedded-api-client.ts:61,195-196` **[new]** |
| `read_file.ts` is ~55% domain logic (~390 of 707 lines) | full read, classified per section into schema / delegation / logic / presentation **[new]** |
| `IndexManager` is the one non-injectable dependency | `rlm-indexing.ts:586` constructs it directly; `injectedDeps` (`contextual-search-rlm.ts:103-111`) has no field for it **[new]** |
| `searchImpl` touches **13 of 23** facade members; `ensureInitialized()` is called by 7 of 15 delegates; `RRF_K`, `fileFilterCache`, `queryUnderstanding` are each touched by exactly one | read of every `*Impl` body, tabulated as a member→consumer matrix **[new]** · **corrected at T19 — C2**: this read "13 of ~16". The class declares **11 state members and 21 methods**; the denominator is the **23 distinct members the delegates actually read**, and `~16` had no method behind it. Do not confuse this `~16` with the "~16 files mention the `rlm-` name" figure elsewhere in this document, which is a different metric and is correct |
| facade tests: 41 total = 24 forwarding-only + 17 real behavior, covering 6 of 21 delegate surfaces | read of `__tests__/contextual-search-rlm-coverage.test.ts` **[new]** |
| 14 needles; 7 in `services/search/`; 4 in `rlm-*` files | parsed `benchmarks/needles/fixtures/massa-ai.json` **[new]** |
| needles scores a moved target as zero behind a `[warn]` | `benchmarks/needles/run.ts:233-236`; hit predicate at `benchmarks/needles/scorer.ts:94-104` **[new]** |
| M14 split 1668 → 463 | `audit-remediation-2026-07` design notes |
| T18 removed ~23 lines of dead imports from the facade | `git show 17f345a --stat -- packages/core/src/services/search/` |
| facade at 63.55% line coverage, 78 uncovered lines all delegation bodies | DEBT-02 coverage gate run, `audit-remediation-2026-07` PR2 |
| `48d0f39` five-factory initialization failure | `.specs/project/STATE.md`, PR1 out-of-band fix |
| `tools/read_file.ts` 707 lines | `wc -l` — unchanged, confirmed |
