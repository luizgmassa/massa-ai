# Core Layering and God-Module Split Specification

- **Slug**: `core-layering-god-module-split`
- **projectId**: `massa-ai`
- **workflowSessionId**: `spec-core-layering-god-module-split`
- **Workflow**: spec-driven (Specify → Design → Tasks → Execute)
- **Sizing**: Large. Behavior-preserving structural refactor across the whole of `packages/core`,
  plus a filename rename.
- **Status**: Specified; assumptions closed 2026-07-28; Design in progress.
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
| AS-02 | What replaces the `Impl(this, …)` delegation shape? | Capability modules owning only the state they use, with dependencies injected. Settled in `design.md` against the member→consumer matrix; the separable and shared members are already identified. | **y** |
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
**AC-3**: Each of the **36** backward imports and the **34** `tools → services` imports is either
removed or explicitly recorded as accepted, with its reason, in the check's own allowlist. The
counting method is stated with the number: backward = importing layer sits later than the imported
layer in the declared order; `tools → services` = unique (tool-file → service-module) edges, which
is 34 where the raw line count is 36.
**AC-4**: The `data → services` group — **24 of the 36**, dominated by `getPrismaClient` from
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

**AC-1**: `tools/read_file.ts` no longer holds logic that is not schema validation or delegation.
**AC-2**: A representative tool handler's behavior is unchanged, proven by tests written **before**
the move and passing unmodified after it.

### GMS-03 — The search facade's collaborators depend on capabilities, not on the facade

No delegate in the search subsystem takes the facade instance as a parameter in order to reach
its dependencies.

**AC-1**: No `*Impl` signature in `services/search/` begins with the facade instance.
**AC-2**: A unit test of any single search capability can construct it without mocking five
factory modules — the `48d0f39` failure mode is structurally impossible. Note the sixth
dependency the original draft missed: `ensureInitializedImpl` builds `IndexManager` by direct
construction (`rlm-indexing.ts:586`), not through a `get*` factory, and `injectedDeps` has no
field for it — so it is the one dependency that cannot be injected today.
**AC-3**: `contextual-search-rlm.ts`'s fan-in and fan-out are both lower after the change than
before, **measured by a script committed in PR-B and run at both commits**. The original 22 / 26
figures do not reproduce and are not the baseline: at `a6216cd` fan-in is **24** counting static
imports, **26** including the two dynamic `await import(...)` sites in `scripts/beir-benchmark.ts:258`
and `scripts/symbol-benchmark.ts:213`, and fan-out is **19** distinct module specifiers. A
before/after comparison is only meaningful once the counting method is executable rather than
described, which is why the script is a deliverable and not a note.

### GMS-04 — `rlm-*` files are renamed exactly once

The blast radius is roughly an order of magnitude smaller than the original draft budgeted: at
`a6216cd`, **4 files** statically import an `rlm-*` module (`contextual-search-rlm.ts`,
`rlm-search.ts`, `__tests__/rlm-indexing.test.ts`, `__tests__/graph-stream-project-scope-pg.test.ts`),
plus one test using `typeof import(...)` and `mock.module` targets
(`__tests__/contextual-search-rlm-coverage.test.ts`). Roughly **16 files** mention the name at all.

**AC-1**: No source or test file under `packages/core/src` is named `rlm-*`.
**AC-2**: Every importer is updated in the same commit as the rename; no compatibility re-export
file is left behind.
**AC-3**: `rg 'rlm-'` returns only CHANGELOG and `.specs/` history.
**AC-4**: The three non-source mention sites are updated in the same commit: `docs/ONBOARDING.md`
(3 places, including the layer-4 tour entry), `CLAUDE.md:157`, and — critically —
`benchmarks/needles/fixtures/massa-ai.json`, which pins **4 needle targets** to
`services/search/rlm-fusion.ts` and `services/search/rlm-search.ts` **by path**. Missing that
fixture does not fail loudly: `benchmarks/needles/run.ts:233-236` skips a missing target with a
`[warn]` and scores the needle zero, which is indistinguishable from a retrieval regression. PR-A
(`sensor-repair-2026-07` SEN-04) converts that silent skip into a hard failure and content-anchors
the fixture; **AC-4 assumes PR-A has landed.** If PR-B were somehow taken first, this criterion
alone makes the needles gate unreadable for the entire refactor.

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
2. **It is a before/after comparison, not a single run.** The floors are a backstop; the evidence
   is that per-needle ranks are unchanged across the refactor. A run that clears the floor while
   quietly losing three needles from rank 1 to rank 4 is a regression that passed.
3. **Each observation costs roughly 90 minutes and a local Ollama.** `needles-gate.yml` is
   `workflow_dispatch`-only and `continue-on-error: true` by design — qwen3-embedding:8b is ~60 s
   per embed on a 2-core runner. Budget the runs into Tasks; do not discover this mid-Execute.

---

## Risks

| ID | Risk | Why it is real here | Status |
| --- | --- | --- | --- |
| R-01 | A behavior-preserving refactor silently changes retrieval quality | **Restated — the original had it backwards.** The needles gate is not a sensor that might miss a regression; as built it is a sensor that manufactures one. 7 of 14 needles are pinned by `filePath` + line range into `services/search/`, and `run.ts:233-236` scores a moved target as zero behind a `[warn]`. Retired by PR-A (SEN-04); until then the refactor has **no** retrieval sensor at all. | Open — owned by PR-A |
| R-02 | The refactor is validated against tests written after the change | Tests written from the new shape cannot detect that the old shape did something else. Sharpened by evidence: 24 of the facade's 41 existing tests are forwarding-only and will protect nothing once the wrapper they assert is removed. GMS-05 AC-1 owns this. | Open |
| R-03 | Splitting again produces another facade | M14 already did one split that preserved fan-in/fan-out exactly. Repeating the same move is the default failure. GMS-03 AC-3's committed measurement script is the check that would catch it. | Open |
| R-04 | The intermediate state is unshippable | Merging to `main` with green CI auto-cuts and publishes a release. Every one of PR-A..PR-D must be independently shippable. AS-05's four-PR boundary is the mitigation. | Open |
| R-05 | The `rlm-*` rename collides with in-flight work | **Retired.** Premised on 40+ importers; the measured figure is 4. A concurrent branch touching search conflicts in at most a handful of files. | Retired 2026-07-28 |
| R-06 | The layering change breaks a transport | New. `ExecutorController` is imported directly by `apps/tools-api/src/routes/executor.ts:13,17` and `apps/mcp-client/src/embedded-api-client.ts:43`, so it is public surface despite living in `controllers/`. AS-01 keeps its exported symbol name for exactly this reason. `GraphController` is likewise live via `routes/workspace.ts:461,612` — an earlier sweep called it dead code and was wrong. | Open |
| R-07 | The `GraphController` / `TracePathTool` divergence is fixed by accident | New. REST and embedded reach `trace_path`/`impact_analysis` through two implementations with separate parameter mapping. Any tidy-up that silently unifies them is a **behavior** change inside a behavior-preserving PR, and would be validatable as neither. It must be left alone here and fixed in its own change. | Open |
| R-08 | **PR-C is two changes wearing one label** | Raised by the Plan Challenge critic and confirmed. "Retire the controllers layer" touches 3-4 files. GMS-01 AC-4's `data → services` group touches **24 edges across 12 files under `data/`**, is unrelated to AS-01, and carries its own risk. AS-05 sized PR-C on the controllers move alone. Design must either split it or state explicitly why one PR is right, with the file counts compared. The rule of thumb agreed: if the `data → services` work touches more than 3× the files the controllers move does, the single-PR framing is wrong. | Open — resolve in Design |

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
| fan-in 24 static / 26 with dynamic; fan-out 19 distinct specifiers | `rg -l "from ['\"][^'\"]*contextual-search-rlm"` for fan-in, plus the two `await import(...)` sites in `scripts/beir-benchmark.ts:258` and `scripts/symbol-benchmark.ts:213`; `rg -o "from \"...\"" \| sort -u` for fan-out. A plain-string grep returns 37 files and overcounts — 13 are comments, fixture paths and `mock.module` targets **[re-derived — 22/26 does not reproduce]** |
| `rlm-*`: 4 static importers, ~16 files mentioning the name | `rg -l "from ['\"][^'\"]*rlm-(indexing\|search\|fusion\|synapse\|admin)"` and `rg -l 'rlm-' -g '!node_modules' -g '!.specs/**' -g '!CHANGELOG.md'` **[re-derived — "40+ importers" is wrong by ~an order of magnitude]** |
| `rlm-*` LOC table | `wc -l` over `packages/core/src/services/search/{contextual-search-,}rlm-*.ts` — unchanged, confirmed |
| 3 of 6 controllers hold real orchestration | read of all six; events at `memory-controller.ts:164-171,184-186` and `search-controller.ts:239-250,282-295`; composition at `context-controller.ts:120-171` **[new]** |
| `GraphController` is live, not dead | `apps/tools-api/src/routes/workspace.ts:16,94-96,461,612`, plus its own 380-line `__tests__/graph-controller.test.ts`. An automated sweep reported it as having zero importers; that was wrong and was caught before it reached this document **[new]** |
| `trace_path`/`impact_analysis` have two implementations | REST `routes/workspace.ts:461,612` → `GraphController`; embedded `embedded-api-client.ts:159,166` → `new TracePathTool()` → `tracePathService` **[new]** |
| `ExecuteTool`/`ExecuteFileTool`/`BatchExecuteTool` are dead | exported at `tools/index.ts:40,42,44`; `rg 'new (ExecuteTool\|ExecuteFileTool\|BatchExecuteTool)\('` → zero matches **[new]** |
| `WebController` lives in `services/` and both transports use it | `services/web/web-controller.ts`; `routes/web.ts:34-35`, `embedded-api-client.ts:61,195-196` **[new]** |
| `read_file.ts` is ~55% domain logic (~390 of 707 lines) | full read, classified per section into schema / delegation / logic / presentation **[new]** |
| `IndexManager` is the one non-injectable dependency | `rlm-indexing.ts:586` constructs it directly; `injectedDeps` (`contextual-search-rlm.ts:103-111`) has no field for it **[new]** |
| `searchImpl` touches 13 of ~16 facade members; `ensureInitialized()` is called by 7 of 15 delegates; `RRF_K`, `fileFilterCache`, `queryUnderstanding` are each touched by exactly one | read of every `*Impl` body, tabulated as a member→consumer matrix **[new]** |
| facade tests: 41 total = 24 forwarding-only + 17 real behavior, covering 6 of 21 delegate surfaces | read of `__tests__/contextual-search-rlm-coverage.test.ts` **[new]** |
| 14 needles; 7 in `services/search/`; 4 in `rlm-*` files | parsed `benchmarks/needles/fixtures/massa-ai.json` **[new]** |
| needles scores a moved target as zero behind a `[warn]` | `benchmarks/needles/run.ts:233-236`; hit predicate at `benchmarks/needles/scorer.ts:94-104` **[new]** |
| M14 split 1668 → 463 | `audit-remediation-2026-07` design notes |
| T18 removed ~23 lines of dead imports from the facade | `git show 17f345a --stat -- packages/core/src/services/search/` |
| facade at 63.55% line coverage, 78 uncovered lines all delegation bodies | DEBT-02 coverage gate run, `audit-remediation-2026-07` PR2 |
| `48d0f39` five-factory initialization failure | `.specs/project/STATE.md`, PR1 out-of-band fix |
| `tools/read_file.ts` 707 lines | `wc -l` — unchanged, confirmed |
