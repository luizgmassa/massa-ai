# Core Layering — Controller Retirement (PR-C) — Tasks

- **Slug**: `core-layering-controller-retirement` · **PR-C**
- **Specify**: `spec.md`, merged via **#56** (`9df5608`)
- **Design**: `design.md`, merged via **#57** (`bc9019b`, merge commit, two parents)
- **Base**: `origin/main` @ `bc9019b`
- **Status**: **Tasks — complete, full Plan Challenge gate run. Execute not started. No code written.**
- **20 tasks**, three phases, **104** distinct files.

Design left exactly one thing open (§6's cut decision) and named two steps that could not be taken
retroactively (§9). This document resolves the first, **records the second as already taken**, and
sizes the work into tasks with measured write sets.

**The Plan Challenge gate on this document found three more plan defects — C18, C19 and C20 — two of
them in artifacts already merged to `main`.** They are corrected in this PR rather than deferred, and
recorded in §7. Corrections owed back to the parent `spec.md` now run **C13 through C20**.

---

## 1. The cut decision — **one PR, three phased commits**

`design.md` §6 recorded rather than resolved this, because resolving it needs the per-task write
sets only Tasks produces. Those sets are now measured, repo-wide over `git ls-files`, at `bc9019b`:

| phase | files in write set | composition |
| --- | --- | --- |
| **1 — kernel tier** | **62** | 6 modules `git mv`'d + **58** distinct importer files (**39** non-test / **19** test) + `kernel/` + AC-1's kernel rule + the embeddings seam |
| **2 — `ToolError` + `POINTER`** | **16** | **13** `ToolError` importers (9 non-test / 4 test) + `enum-validation.ts` + `check-stale-pointers.ts` + its 21-test suite |
| **3 — controllers retired** | **32** | 6 members + **26** importer files (10 non-test / 16 test) + `package.json` + `CLAUDE.md` + `src/index.ts` |
| **sum** | **110** | |
| **distinct union** | **104** | against **PR-B's 37**, which needed 20 tasks and surfaced 19 confirmed plan defects |

**The phases are not disjoint, and the sum is not the review surface.** Six files are touched by two
phases — legitimate in a phased single PR, since a different import line is repointed in each pass,
but a reviewer sizing per-phase diffs must not double-count them:

| overlap | files |
| --- | --- |
| Phase 1 ∩ Phase 3 (**5**) | `production-wiring.ts`, `search-controller.ts`, `search_project.ts`, `search-dependency-outage.test.ts`, `search-tools-coverage.test.ts` |
| Phase 2 ∩ Phase 3 (**1**) | `wave-4-enum-validation.test.ts` |
| Phase 1 ∩ Phase 2 | none |

Per-module importer counts behind the 58, since §6's table counted only one of the six moved
modules and said so:

| module | importers | non-test | test | note |
| --- | --- | --- | --- | --- |
| `db-connection` | **14** | 9 | 5 | includes `packages/core/scripts/create-3072d-table.ts`, **outside `src/`** |
| `alias-resolver` | **21** | 14 | 7 | the largest single set |
| `search-diagnostics` | **16** | 11 | 5 | §5.4 froze it for PR-B |
| `fqn-codec` | **12** | 9 | 3 | |
| `identity-guard-installer` | **5** | 5 | 0 | |
| `lexical-search` | **3** | 2 | 1 | |
| **union (distinct files)** | **58** | **39** | **19** | modules share importers |

**Decision: PR-C ships as one PR, planned and committed as three independently-revertable phases.**
This is `design.md` §6's stated position, confirmed against the measured sets rather than assumed
from them. **Decided by: the user, 2026-07-31**, from three options presented with these figures.

**Options rejected, and why:**

1. **Three PRs, one per phase.** Genuinely defensible and the strongest challenger — each phase is
   independently shippable, which is exactly what R-04 asks for, and AC-1's check would ship
   incrementally with the restructuring each rule validates. **Rejected on review and release cost**:
   three review cycles and three auto-cut releases for one behavior-preserving refactor, where
   AS-05 already sized PR-C as one of four PRs rather than as three of six.
2. **Two PRs — kernel, then the rest.** Splits at the one seam `design.md` §5.3 called real
   (contract extension vs mechanical relocation), at ~65 / ~49. **Rejected** for the same reason at
   smaller scale, and because it puts AC-1's two rules in different PRs without the compensating
   benefit of phase 2 standing alone.

**What the one-PR choice obliges, and these are not optional.** The review surface is ~3× PR-B's,
so the mitigations have to carry the weight the split would have:

- **Each phase is its own commit range and must be green on its own**, so any one is revertable
  without the others. A phase that only compiles once a later phase lands is not a phase.
- **G-HUB runs per structural commit, not once at the end — reading `maxForeignReach`, not
  `maxFileLoc`** (R-11 as amended by **C20**). Measured: the controller move leaves `maxFileLoc` at
  **696, unchanged**; `ContextualSearchRLM`'s `maxForeignReach` goes **1 → 3** against a ceiling of
  **3**. The four lines of LOC headroom are not what this move spends.
- **Phase 1 contains no controller churn.** That boundary is what keeps the two problems separable
  under review even in one PR.

---

## 2. R-10 — the CHANGELOG heading, chosen before merge

`spec.md` R-10 requires PR-C to choose deliberately and record who chose and what was rejected,
because PR-B's semantics were settled by the act of merging with zero comments.

**Decision: `### Changed`, cutting a minor.** **Decided by: the user, 2026-07-31.**

**Rejected:**

- **`### Removed`, cutting a major.** Removing `packages/core/package.json`'s published
  `"./controllers"` exports subpath is a breaking change by strict semver regardless of consumer
  count. Rejected because the measured consumer count is **zero** — `@massa-ai/core/controllers`
  returns no hits in-repo or in either transport, both of which import `ExecutorController` from the
  root barrel (`spec.md` §3.D) — and a major bump on a subpath nobody imports prices the change
  wrong.
- **`### Fixed`, cutting a patch.** Cheapest, and true that this is behavior-preserving with no
  feature and no bug fix. Rejected because it understates the subpath removal and contradicts PR-B's
  own precedent, where 12 `### Changed` bullets cut v1.16.0 for a refactor of the same kind.

`### Changed` is the honest floor: a published surface changes, and no behavior does.

---

## 3. T0 — the two non-retroactive steps, **already taken**

`design.md` §9 names these as the two things Tasks must sequence first because neither can be taken
after the fact. **Both were taken on 2026-07-31 at `bc9019b`, before any structural commit**, and
their readings are recorded here rather than left to Execute.

### 3.1 Frozen base reading — `check-stale-pointers` at `bc9019b`

```
60 rlm-* / search-facade-* pointers in tracked files outside CHANGELOG.md, .specs/, .ua/, …
  RESOLVES   32
  HISTORICAL 28  (pinned at 28)
[stale-pointers] PASS — 0 broken, historical exactly at its pin of 28
```

### 3.2 The no-op control — `design.md` §5.3 property 4

The check §5.1's first decision never ran. `POINTER` was patched with the §5.2 suffix branch —
prefix branch byte-identical, one added alternation — and run against the **unchanged** tree:

```
142 rlm-* / search-facade-* pointers …
  RESOLVES   114
  HISTORICAL 28  (pinned at 28)
```

**The count moves: 60 → 142, RESOLVES 32 → 114, +82 pointers.** The reshape is not a no-op, which is
the one thing C16's rejected remedy could not show. **HISTORICAL correctly does not move** — the
controllers still exist at this commit, so their citations `RESOLVE` rather than becoming historical.
That is the expected reading, and reading a flat HISTORICAL as "the reshape did nothing" is the trap:
**the observable that must move is the total, not the pin.**

> **The reading above was taken with a correctly-tagged patch, and `design.md` §5.2's snippet as
> first published was not.** That is **C18**, the twenty-fifth plan defect, found by the Plan
> Challenge gate on this document. `String.raw` tagged only the **first** of two concatenated
> template segments; in the untagged second, `\.` collapses to a wildcard and **`\b` becomes the
> backspace character U+0008**. Typed verbatim it takes the gate to **`FAIL — 0 broken, 0 historical
> against a pin of 28`** — it does not merely fail to add suffix coverage, it **kills the untouched
> prefix branch**, because the alternation is one expression.
>
> | `POINTER` | pointers | RESOLVES | HISTORICAL | verdict |
> | --- | --- | --- | --- | --- |
> | untouched baseline | 60 | 32 | 28 | PASS |
> | §5.2 **as first published** | **0** | **0** | 28 | **FAIL** |
> | both segments tagged | 142 | 114 | 28 | PASS |
>
> `design.md` §5.2 is corrected in this PR. **T6 carries the acceptance check that would have caught
> it**, because a narrowly-scoped unit test can pass against a silently-empty regex.

### 3.3 Coverage is **59 of 61**, not 61 — record it as such

`spec.md` §4.2's **61** `controllers/<file>.{ts,js}` pointers outside `EXCLUDED` **reproduces
exactly** at `bc9019b`. The reshaped `POINTER` sees **59** of them. The two it cannot see are both
`controllers/index.js`, because `index` matches neither a prefix stem nor `*-controller`:

| pointer | why it is not a silent strand |
| --- | --- |
| `packages/core/package.json:30` | the `"./controllers"` exports subpath — **AC-6's** explicit subject, with `npm pack --dry-run` as its named check |
| `packages/core/src/index.ts:18` | `export * from "./controllers/index.js"` — a TypeScript `export *` from a deleted path is a **build failure**, not a strand; also **AC-2's** subject |

**R-09 must therefore be recorded as closed by three mechanisms, not one**: 59 pointers by the
reshaped gate, 1 by AC-6, 1 by AC-2. `design.md` §5 never claimed 61 for the adopted remedy, so this
adds precision rather than correcting a claim.

### 3.4 The reshape widens the gate past PR-C's own scope

Of the **82** newly-covered pointers, **59** are the `controllers/`-path ones above and **23** are
bare `*-controller.{ts,js}` citations carrying no directory. Two of those name
`services/web/web-controller.ts` — the `WebController` precedent that already lives in `services/`
and that PR-C does **not** retire.

This is strictly stricter, so it cannot produce a false PASS. But it means the gate now watches a
file outside PR-C's write set, and a future move of `web-controller.ts` will fail it. **Recorded, not
mitigated** — narrowing the branch to exclude it would mean a path-anchored pattern, which is the
positional-assumption class C16 exists to warn about.

---

## 4. Tasks

Write sets are measured, not estimated. Every task states the gates it must leave green.

### Phase 1 — kernel tier (**no controller churn**)

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T1** | Create `packages/core/src/kernel/`. `git mv data/db-connection.ts kernel/db-connection.ts`; repoint **14** importers, **including `packages/core/scripts/create-3072d-table.ts` in the same commit** — it reaches in by relative path from outside `src/` and breaks on any move | 1 moved + 14 | **C14** |
| **T2** | Promote the 3 pure leaves — `structural/fqn-codec.ts`, `search/search-diagnostics.ts`, `search/lexical-search.ts`. All three are leaf-verified: zero cross-tier relative imports | 3 moved + 31 | AC-4 (part) |
| **T3** | Promote the 2 `project-identity` modules — `alias-resolver.ts`, `identity-guard-installer.ts`. Legal only after T1: their `../../data/db-connection.js` edges become `kernel → kernel` | 2 moved + 26 | AC-4 (part) |
| **T4** | **The embeddings seam — its own task (R-13).** An **optional** injection point on `base-vector-store.ts` that **defaults to today's `createEmbeddingProvider({ cache: true })` call**, on T11's F4 shape. Not a replacement: `:57` is a lazily-assigned memoised promise, and moving it to construction time would change when provider selection happens. Parity test proving behavior identical when nothing is injected; violation shapes observed red | 1 subclass + 1 factory + **39** constructions across **5** test files + **5** `mock.module` sites | AC-4 (last edge) |
| **T5** | AC-1's CI check — **kernel rule only**. Path-prefix over the import graph: membership is "path starts with `packages/core/src/kernel/`". `data → kernel` legal, `data → services` illegal, **and `kernel → {tools,services,data}` illegal** — leaf-ness enforced, not asserted, or the first `kernel → services` edge silently reintroduces the cycle C14 exists to prevent. **Zero allowlist entries.** Both directions observed red before it is quotable | 1 new script + its tests + CI wiring | AC-1 (part) |

**Gates per structural commit in this phase**: `lint`, `type-check`, `build`, `test`, and **G-HUB —
recording the `maxForeignReach` column** (R-11 as amended by C20).

### Phase 2 — `ToolError` and the `POINTER` reshape

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T6** | Reshape `POINTER`: add `SUFFIX_STEMS = ["controller"]` and a second alternation branch, **prefix branch byte-identical**. **Every concatenated template segment carries its own `String.raw` tag — C18.** Extend the 21-test suite; **both directions observed red** (§5.3 property 3): a controller path deleted without its citations repointed must fail; a citation deleted must fail. **Acceptance is a full-corpus reading, not just green units**: the landed code must print exactly **142 pointers / RESOLVES 114 / HISTORICAL 28** against the unchanged tree. A silently-empty regex passes narrow unit tests and prints `0 / 0 / 28` | `scripts/check-stale-pointers.ts` + `scripts/__tests__/check-stale-pointers.test.ts` | R-09 (part) |
| **T7** | **Re-pin `HISTORICAL_PINNED` as its own commit** (§5.3 property 2), separate from any move, against §3.1's frozen reading | 1 constant, 1 commit | R-09 (part) |
| **T8** | Relocate `ToolError` out of `tools/enum-validation.ts`; repoint **13** importers — 4 `services → tools` edges (`filter-validation`, `active-generation`, `architecture`, `git-ref-validation`), **5 same-layer `tools/` files** (`get_architecture`, `get_references`, `impact_analysis`, `search_definitions`, `trace_path`) and 4 tests. **`validateEnum` moves with it** (T8b) — leaving it behind half-empties the file and sustains a backward edge | 1 moved + 13 | **AC-5** |
| **T8b** | **The 5 edges the controllers bring with them — C19.** Repoint every `controllers → tools` import so that moving those files into `services/` does **not** grow `services → tools` from 4 to 9: `CompressContextTool` (`context-controller.ts:19`, value), `validateEnum` (`executor-controller.ts:31`, value — relocate alongside `ToolError` in T8, same file), and the three type-only `Execute*Params` (`:28,29,30`), whose types move with them. **Closes AC-3 by removal, not by exemption**, which is what keeps T5's *zero allowlist entries* true and AC-1's check discriminating | 2 source files + the `tools/` modules the symbols move out of | **AC-3** |

### Phase 3 — controllers retired

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T9** | **Characterization tests first**, on one of the 6 `tools/` handlers that import `controllers/` (`delete_memory`, `get_optimized_context`, `search_memories`, `search_project`, `store_memory`, `update_memory` — `spec.md` §3.E). Written **before** the move, must pass **unmodified** after it | 1 test file | **GMS-02 AC-2** |
| **T10** | Move the 3 real orchestrators — `MemoryController`, `SearchController`, `ContextController` — into `services/`, keeping exported symbol names. **Requires T8b** or `ContextController` carries a live `→ tools/` edge in with it. **Record G-HUB's `maxForeignReach` after this commit**: it goes 1 → 3, exactly at the ceiling | 3 moved + importers | AS-01 |
| **T11** | Fold `ExecutorController` into `services/executor/`, **keeping its exported symbol name** — `apps/tools-api/src/routes/executor.ts` and `apps/mcp-client/src/embedded-api-client.ts` import it directly (R-06). **Requires T8b** — it holds 4 of the 5 `→ tools/` edges | 1 moved + 2 transports | AS-01 |
| **T12** | Move `GraphController` into `services/`. **Its `TracePathTool` divergence is left alone** — R-07, out of scope, unifying it is a behavior change inside a behavior-preserving PR. `GraphController` is **live** via `routes/workspace.ts`; an earlier sweep called it dead and was wrong | 1 moved + importers | AS-01 |
| **T13** | Delete `controllers/index.ts` and the `export * from "./controllers/index.js"` at `src/index.ts:18`. Remove `package.json`'s `"./controllers"` exports subpath; verify with `npm pack --dry-run` that no listed path lacks a backing file | `package.json`, `src/index.ts` | **AC-6** |
| **T14** | Contract text — `src/index.ts`'s header **and** `CLAUDE.md`'s Architecture section describe the kernel contract, **one description only, no third anywhere** | 2 files | **AC-2** |
| **T15** | AC-1's check gains the controllers rule and ships **with** this restructuring, not after it | 1 script + tests | **AC-1** (rest) |

### Phase 4 — the record

| # | task | write set | closes |
| --- | --- | --- | --- |
| **T16** | Amend **C13 through C20** into the parent `core-layering-god-module-split/spec.md`, in place, indexed in its *Design and Execute corrections* table in the C1–C12 style. **Same commit fixes that file's stale Status line**, which still reads *"Execute in progress (PR-B, T19 of 20)"* against a PR-B merged as #53 and released v1.16.0 | 1 file | C13–C20 |
| **T16b** | **Register PR-C in `.specs/project/FEATURES.json`.** The feature has **no entry at all** — 54 features, and `core-layering-controller-retirement` is not one of them, though Specify, Design and Tasks are all on `main`. The registry is hand-maintained and its history shows it updated inside feature PRs, including PR-B's own `ab80e62`; #56 and #57 both skipped it. Add `{slug, title, status: in_progress, priority, phases: {specify: true, design: true, tasks: true, execute: false}, spec, design, tasks}`. **Do not touch `active_feature`** — it reads `skills-directive-dedup`, which matches `STATE.md`'s `## Current` section (paused at T5 of 12 on the user's instruction) and is **not** stale | 1 file | record |
| **T17** | CHANGELOG entry under **`### Changed`** (§2) | 1 file | R-10 |
| **T18** | **Independent validation — author ≠ verifier**, on PR-B's T20 precedent. Re-derives every criterion from raw data rather than from this file. Writes `validation.md`. **Must re-run T6's full-corpus reading and T10's `maxForeignReach`**, not inherit them | 1 file | GMS-01, GMS-02 AC-2 |

---

## 5. Ordering, and what depends on what

Follows `design.md` §6's cheapest-and-most-separable-first sequence, with the dependencies that make
it mandatory rather than preferred:

1. **T0 before everything** — done; §3's readings cannot be taken retroactively.
2. **T1 before T3.** `alias-resolver` and `identity-guard-installer` import `data/db-connection.js`;
   promoting them before `db-connection` moves produces `data → kernel → data`, the cycle C14 exists
   to prevent.
3. **T2 is independent of T1 and T3** — all three modules are already leaves.
4. **T5 after T1–T4.** The check cannot pass against a tree the moves have not finished.
5. **T6 before T7**, and **both before any Phase-3 move.** Re-pinning after the controllers are gone
   re-baselines the gate in the same change that moves the files, which is the one edit shape the pin
   exists to make visible.
6. **T8b before T10 and T11**, and this is the dependency the first draft of this document missed.
   Repointing the 5 `→ tools/` edges *after* the files have landed in `services/` means the tree
   carries 9 `services → tools` edges in between — so if T15's AC-1 check enforces that direction,
   Phase 3 is **not green on its own** at that point, which is the one property §1 promises in
   exchange for shipping this as a single PR.
7. **T9 before T10–T12.** GMS-02 AC-2 requires the tests written *before* the move; tests written
   from the new shape cannot detect that the old shape did something else (R-02).
8. **T13 after T10–T12.** The barrel cannot go until its members have.
9. **T16–T18 last**, and T18 by a different author.

---

## 6. Risks this Tasks document adds

| # | risk | mitigation |
| --- | --- | --- |
| R-14 | **104 distinct files in one review surface**, ~2.8× PR-B, which found 19 plan defects at 37 | §1's three obligations — per-phase green, G-HUB per structural commit reading `maxForeignReach`, no controller churn in phase 1 |
| R-15 | **T4's seam is the only *added* seam in PR-C**, and PR-B's only added seam (F4) needed its own task and three observed violation shapes | T4 is its own task with that discipline; default path retained and parity-tested |
| R-16 | **The `POINTER` reshape watches `web-controller.ts`**, outside PR-C's write set | §3.4 — recorded, deliberately not narrowed; narrowing means a path-anchored pattern, the C16 class |
| R-17 | **T16 is the fifth consecutive feature where corrections were owed back and not yet written.** A correction that never lands in the index is a correction that did not happen | T16 is a task with a write set, not a note; T18's verifier reads the parent `spec.md` and must be able to tell an amended criterion from an original one |
| R-18 | **`maxForeignReach` lands at 3/3 after T10 — zero margin.** Any later change adding one more foreign read of `ContextualSearchRLM` flips G-HUB to FAIL, and until C20 the risk register was watching the LOC axis instead | T10 records the post-move reading as a fact; T18 re-derives it rather than inheriting it |
| R-19 | **A code snippet inside a spec is untested code.** C18 shipped a regex to `main` that fails its own gate `0/0/28` | T6's acceptance is a full-corpus reading with exact expected numbers, not "the unit tests are green" |

---

## 7. Plan Challenge record

**Full gate run 2026-07-31** on this document — `spec-driven`, a contract change, a published-surface
change, more than 5 modules. Mode: pre-mortem + evidence audit, read-only critic, instructed to
**measure rather than reason**, on the explicit precedent that C16 and C17 were both found only by
executing something.

**Four findings. All four confirmed by independent re-measurement and folded into §1–§6 above**, not
appended. Every figure below was re-derived before acceptance — [[subagent-numbers-need-remeasuring]].

| # | finding | verdict | where it landed |
| --- | --- | --- | --- |
| 1 | **`design.md` §5.2's snippet is a broken regex** — `String.raw` tags only the first of two concatenated segments | **CONFIRMED**, three ways: baseline `60/32/28 PASS`, as-published `0/0/28 **FAIL**`, both-tagged `142/114/28 PASS` | **C18** — `design.md` §5.2 corrected; §3.2 and **T6**'s acceptance check |
| 2 | **5 `controllers → tools` edges become `services → tools`** on the move, group 4 → 9; **AC-3 owned by no task** | **CONFIRMED** — matches the parent spec's own `controllers → tools` count of 5; `grep -c "AC-3" tasks.md` → **0** | **C19** — `design.md` §6, `spec.md` §3.C, new **T8b**, ordering rule 6 |
| 3 | **R-11 names the wrong metric** — `maxFileLoc` is untouched by the move | **CONFIRMED** by simulation: `maxFileLoc` **696 → 696**, `maxForeignReach` **1 → 3** against a ceiling of 3 | **C20** — `spec.md` §7, `design.md` §7, §1's gate rule, **T10**, **R-18** |
| 4 | **§1's total is a sum of overlapping sets** | **CONFIRMED, and the critic's own figure corrected**: it listed **3** overlapping files; repo-wide there are **6**. Sum **110**, distinct union **104** | §1's table and overlap breakdown |

**What the gate got right that matters most.** Findings 1 and 2 are not residual risks — they are
reproducible defects that would have shipped. Finding 1 put a regex on `main` that fails its own gate,
and the task pointing at it said only "extend the 21-test suite", which a silently-empty pattern
survives. Finding 2 would have grown the exact edge category AC-5 exists to eliminate, while the
criterion that polices it had no owner at all.

**Where the critic was corrected.** Its overlap list was short by three files — **the eighth
consecutive critic on this feature whose mechanism held while a figure did not.** It also disclosed
not verifying T9's before/after property, the parent `validation.md`, T13's `npm pack --dry-run`, or
any partially-moved tree's compile state; those remain unestablished and are T18's.

**One finding the critic did not raise, found separately**: PR-C has **no `FEATURES.json` entry at
all** → **T16b**. And one premise checked before acting on it and found **not** stale:
`active_feature: skills-directive-dedup` matches `STATE.md`'s `## Current` and must be left alone.

**Escalation:** `escalate_to_full: true`, moot — the full gate was already selected.
`serious_findings: revise_plan` applied: findings 1–4 revised the plan and two merged artifacts
rather than being appended to them.

---

## 8. Next action

**Execute, T0 → T1.** T0 is recorded above; T1 is the first structural commit. Phase 1 first —
kernel tier, no controller churn.
