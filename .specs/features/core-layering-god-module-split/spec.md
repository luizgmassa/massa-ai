# Core Layering and God-Module Split Specification

- **Slug**: `core-layering-god-module-split`
- **projectId**: `massa-ai`
- **workflowSessionId**: `spec-core-layering-god-module-split`
- **Workflow**: spec-driven (**Specify only** — Design, Tasks and Execute are deliberately not started)
- **Sizing**: Large. Behavior-preserving structural refactor across the whole of `packages/core`, plus a filename rename with 40+ importers.
- **Status**: Specified, not scheduled. `execute: false` in `FEATURES.json`.

## Why this exists

`audit-remediation-2026-07` deferred exactly three items to "their own spec" and named this one
as the owner of all three. This document closes that pointer so the deferral is a decision with
an address rather than a note in an Out of Scope table:

| Deferred by | Item | Recorded reason |
| --- | --- | --- |
| `audit-remediation-2026-07` Out of Scope | Controllers-layer restructuring (38 backward imports; `tools → services` 34× vs `tools → controllers` 6×) | "Behavior-preserving structural refactor. Needs its own risk budget and validation pass." |
| `audit-remediation-2026-07` Out of Scope | `contextual-search-rlm.ts` god-module split (fan-in 22, fan-out 26) | "Same. Also rewrites the exact files a `rlm-*` rename would touch." |
| `audit-remediation-2026-07` TASK-021 non-goal | `rlm-*` source/test filename rename (12 files, 40+ importers) | "Deferred to the god-module refactor, which rewrites those files. Renaming twice is churn for zero behavior change." |

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
implies — `tools → services` occurs 34 times against `tools → controllers` 6 times. The
controllers layer is not a layer that is being bypassed occasionally; it is a layer that was
mostly never adopted. `tools/read_file.ts` is **707 lines**, which is not a thin handler under
any reading of the contract it is supposed to satisfy.

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

## Assumptions & Open Questions

Every row below is an **open question for the Design phase**, not a settled default. Specify-only
means the problem is agreed and the shape is not.

| ID | Question | Candidate positions | Confirmed? |
| --- | --- | --- | --- |
| AS-01 | Is `controllers/` adopted for all 31 tools, or deleted in favour of a two-layer `tools → services` contract that matches reality? | Adopting it is 34 import rewrites and 25 new controllers. Deleting it is smaller and honest, but discards the seam that owns side-effects. | **n** |
| AS-02 | What replaces the `Impl(this, …)` delegation shape? | Extracted collaborators with injected dependencies; or genuine modules taking only the state they use; or the facade stays and only its dependency wiring changes. | **n** |
| AS-03 | Does the `rlm-*` rename land in the same PR as the split, or immediately after it? | Same PR keeps the rename free (files are rewritten anyway) but makes the diff unreadable for review. | **n** |
| AS-04 | How is "behavior preserving" proven, given the seam had 63.55% coverage before this work and the facade-forwarding tests added in PR2 are the only characterization of it? | Characterization tests first, then refactor, is the repo's own precedent (`code-compressor.test.ts` is named "characterization"). | **n** |
| AS-05 | Is this one PR or several, and what is the intermediate state? | The repo must build and pass CI at every commit; a partially-adopted controllers layer is a state where the contract holds nowhere. | **n** |
| AS-06 | Does `tools/read_file.ts` (707 lines) get split as part of the layer work, or does it get its own change? | It is the clearest single instance of logic in the tools layer, so it is the natural first vertical slice. | **n** |

**Open questions: all six.** That is the expected state for a Specify-only artifact and is why
`execute` is `false`.

---

## Requirements

Stable IDs. Acceptance criteria are written to be checkable, but no criterion here has been
validated against an implementation — none exists.

### GMS-01 — The layer contract is true or corrected

The dependency direction stated in `packages/core/src/index.ts` and `CLAUDE.md` holds for every
import in `packages/core`, or both documents are updated to state the contract that is actually
enforced.

**AC-1**: A deterministic check (import graph over `packages/core/src`) reports zero imports that
cross a layer in the disallowed direction, and that check runs in CI.
**AC-2**: `CLAUDE.md`'s Architecture section and `src/index.ts`'s header describe the same
contract the check enforces, with no third description anywhere.
**AC-3**: The 38 backward imports and the 34 `tools → services` imports are each either removed or
explicitly recorded as accepted, with the reason, in the check's own allowlist.

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
factory modules — the `48d0f39` failure mode is structurally impossible.
**AC-3**: `contextual-search-rlm.ts`'s fan-in and fan-out are both lower than the current 22 / 26,
measured the same way, and the measurement is recorded.

### GMS-04 — `rlm-*` files are renamed exactly once

**AC-1**: No source or test file under `packages/core/src` is named `rlm-*`.
**AC-2**: Every one of the 40+ importers is updated in the same commit as the rename; no
compatibility re-export file is left behind.
**AC-3**: `rg 'rlm-'` returns only CHANGELOG and `.specs/` history.

### GMS-05 — Behavior is preserved and proven so

**AC-1**: Characterization tests covering the seam exist and pass **before** any structural change,
and pass unmodified after it. The facade-forwarding tests added in `audit-remediation-2026-07` are
the starting point, not the whole set.
**AC-2**: The DEBT-02 coverage gate passes at or above its floor for every file this work touches,
with no new exclusion added to `scripts/check-coverage.ts`.
**AC-3**: No test is weakened, skipped, or deleted to accommodate the refactor. Any test that must
change is a behavior change and therefore out of scope.
**AC-4**: `bun run lint`, `bun run type-check`, `bun run build`, `bun run test`, `bun run test:scripts`
and `bun run test:plugins` are green, and the needles retrieval gate holds its floors
(`NEEDLE_FLOOR_HIT1=0.5`, `NEEDLE_FLOOR_MRR=0.65`) — a search refactor that silently degrades
retrieval quality would otherwise pass every other gate.

---

## Risks

| ID | Risk | Why it is real here |
| --- | --- | --- |
| R-01 | A behavior-preserving refactor silently changes retrieval quality | The needles gate is the only sensor that would notice. It is not part of `bun run test`. |
| R-02 | The refactor is validated against tests written after the change | Tests written from the new shape cannot detect that the old shape did something else. AC-5.1 exists for this. |
| R-03 | Splitting again produces another facade | M14 already did one split that preserved fan-in/fan-out exactly. Repeating the same move is the default failure. |
| R-04 | The intermediate state is unshippable | Merging to `main` with green CI auto-cuts a release. A half-adopted layer contract cannot sit on `main` between PRs. |
| R-05 | The `rlm-*` rename collides with in-flight work | 40+ importers means any concurrent branch touching search conflicts everywhere. Sequencing is a real constraint, not a courtesy. |

---

## Evidence

Gathered at commit `32a647a` on `feat/audit-remediation-debt` unless noted. Every number was read
from current source, not inferred.

| Claim | How it was measured |
| --- | --- |
| tools 31 / controllers 6 / services 208 / data 41 | `find packages/core/src/<layer> -name '*.ts' \| wc -l` |
| `tools → services` 34× vs `tools → controllers` 6×; 38 backward imports | `audit-remediation-2026-07/spec.md` Out of Scope, from the knowledge-graph analysis at `17ee708` |
| fan-in 22 / fan-out 26 for `contextual-search-rlm.ts` | same source |
| `rlm-*` LOC table | `wc -l` over `packages/core/src/services/search/{contextual-search-,}rlm-*.ts` |
| M14 split 1668 → 463 | `audit-remediation-2026-07` design notes |
| T18 removed ~23 lines of dead imports from the facade | `git show 17f345a --stat -- packages/core/src/services/search/` |
| facade at 63.55% line coverage, 78 uncovered lines all delegation bodies | DEBT-02 coverage gate run, `audit-remediation-2026-07` PR2 |
| `48d0f39` five-factory initialization failure | `.specs/project/STATE.md`, PR1 out-of-band fix |
| `tools/read_file.ts` 707 lines | `wc -l` |
