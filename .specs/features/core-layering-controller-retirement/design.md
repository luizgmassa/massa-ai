# Core Layering — Controller Retirement (PR-C) — Design

- **Slug**: `core-layering-controller-retirement` · **PR-C**
- **Specify**: `spec.md`, merged to `main` via **#56** (`9df5608`, merge commit)
- **Base**: `origin/main` @ `9df5608`
- **Status**: **Design — decisions recorded, sizing recorded. Tasks not started. No code written.**

Specify named three decisions Design owes before PR-C is sized, each with its rejected
alternative. This document delivers all three, plus the defect found while verifying the first.

---

## 1. R-08's precondition — **answered: a kernel tier**

> `design.md` §5.3 (parent feature): *PR-C's Design must answer "where do cross-cutting modules
> live under the AS-01 contract?" **before** it sizes itself.*

**Decision: the layer contract gains an explicit kernel tier.**

```
tools → services → data
         ↖      ↗
          kernel/
```

Rule the CI check enforces: **`data → kernel` is legal; `data → services` is not.** Zero allowlist
entries for this group.

**The tier is a real directory, and the check is path-prefix based.** This is load-bearing, not a
detail: the entire argument for a tier over an allowlist is that kernel membership is *checkable*
rather than *listed*. If AC-1's checker keyed off a maintained list of module specifiers, it would
be the allowlist this section rejects, renamed. So:

- **Physical home: `packages/core/src/kernel/`.** Membership is "the file's path starts with
  `packages/core/src/kernel/`" — nothing to maintain, and `git mv` is what grants membership.
- **The check is a path-prefix rule over the import graph**, not a specifier list. A module that
  has not physically moved is not in the kernel, whatever any table says.
- **Kernel modules are leaf-checked by the same rule**, in the one direction that keeps the tier
  acyclic: a file under `kernel/` may not import from `tools/`, `services/` or `data/`. That is the
  property §2 measures, and it must be enforced, not just asserted — otherwise the first
  `kernel → services` edge silently reintroduces the cycle C14 exists to prevent.

The 5 modules currently under `services/` and the 1 under `data/` (§3) therefore all **physically
move**. "Promoted" in §6's ordering means `git mv`, not re-labelled.

**Decided by: the user, 2026-07-31**, from three options presented with their measured
consequences.

**Options rejected, and why:**

1. **Allowlist as accepted exceptions** — no new tier; the cross-cutting edges enter GMS-01 AC-1's
   allowlist with a written reason each. Cheapest, and AC-3 already establishes the mechanism.
   **Rejected because the check stops discriminating**: once `data/** → services/structural/fqn-codec.js`
   is allowlisted, a *new* `data → fqn-codec` edge is indistinguishable from the recorded ones and
   passes silently. A "true" contract shipping with 14 accepted violations is the outcome GMS-01
   AC-4 exists to prevent — the parent spec says so in as many words: *"resolving AS-01 while leaving
   this unnamed would produce a 'true' contract with 24 accepted exceptions in it."*
2. **Hybrid** — kernel for the 3 clearly-shared modules, allowlist for the 4 remaining
   search/embeddings edges. **Rejected because it ships two mechanisms** for one question, and the
   split it proposed does not survive §2's measurement anyway: the modules it would have promoted
   are precisely the two that cannot be promoted unchanged.

**Why the tier is the right shape and not just the chosen one.** A kernel module is defined by a
property that is checkable — *it imports from no tier* — rather than by a list. That makes the
contract enforceable in the same breath as it is stated, which is GMS-01 AC-1's actual requirement.

---

## 2. The twenty-first plan defect — the criterion could not see the most-shared module

**Found while verifying §1 was implementable rather than assuming it.**

A kernel tier only works if kernel modules are leaves. Measured at `9df5608`, for the six
cross-cutting modules Specify §3 enumerated:

| module | LOC | outbound cross-tier import | leaf? |
| --- | --- | --- | --- |
| `services/structural/fqn-codec.ts` | 361 | none (`./schema-version.js`, `./types.js`) | ✅ |
| `services/search/search-diagnostics.ts` | 148 | **none at all** — no relative imports | ✅ |
| `services/search/lexical-search.ts` | 328 | none | ✅ |
| `services/embeddings/index.ts` | 284 | 6 sibling `services/` modules | ⚠️ **barrel, not a leaf** |
| `services/project-identity/alias-resolver.ts` | 187 | **`../../data/db-connection.js`** | ❌ |
| `services/project-identity/identity-guard-installer.ts` | 155 | **`../../data/db-connection.js`** | ❌ |

**Two of six import `data/`.** Promoting them into a tier that `data/` imports produces
**`data → kernel → data`** — a cycle, and a contract worse than the one being retired. The chosen
option was not implementable as stated.

**What rescues it, and why it is a defect rather than a detail.**
`packages/core/src/data/db-connection.ts` is **40 lines** with **zero relative imports** — only
`@massa-ai/shared`, `@massa-ai/shared/config` and `pg`. A pure leaf.

**Its importer count was measured wrong the first time, and the error is instructive.** The
original sweep used pathspec `packages/core/src/*.ts` and reported 7 services + 1 data + 4 tests.
That pathspec excludes `packages/core/scripts/`. Corrected, repo-wide over all tracked
`*.ts`/`*.js`:

| group | count | files |
| --- | --- | --- |
| `services/` | **7** | `health/local-health-checker.ts`, `hooks/attribution-resolver.ts`, `project-identity/{alias-resolver,identity-guard-installer,service}.ts`, `search/{search-analytics-pg,search-cache-pg}.ts` |
| `data/` | **1** | `keyword/keyword-search-pg.ts` |
| **outside `src/`** | **1** | **`packages/core/scripts/create-3072d-table.ts`** — tracked, imports `'../src/data/db-connection.js'` |
| tests | **5** | includes `project-identity-guard-invalidator.test.ts`, which `mock.module`s the path |
| **total** | **14** | **9 non-test**, 5 test |

**`packages/core/scripts/create-3072d-table.ts` is a hard constraint on the move.** It lives
outside `src/` and reaches in by relative path, so *any* relocation of `db-connection.ts` breaks it
regardless of destination. It must be repointed in the same commit as the move. It is also outside
the `src/`-scoped sweeps this Design otherwise uses — **every PR-C measurement must be taken
repo-wide, not `src/`-scoped.** That is the second pathspec-scoping error in this feature after the
`*` vs `**/` trap in `spec.md` §3.A; both produced a plausible number that was quietly short.

**Seven of its nine non-test importers are in `services/`, and it lives in `data/`.** It is the
most cross-cutting module in the tree, and **GMS-01 AC-4 counts zero of its edges**, because AC-4
counts `data → services` and this module produces `services → data`. *The criterion's direction is
what hid it.* Same shape as [[check-a-guards-direction-and-surface-first]]: the guard existed,
aimed the other way.

**Consequence for the contract:** with `db-connection.ts` in the kernel, `alias-resolver` and
`identity-guard-installer` become **`kernel → kernel`**, which is legal, and the cycle dissolves.
The tier works — but only once a module nobody counted is included.

**This is owed back to the parent `spec.md` as C14**, alongside C13, in the same in-place style.

---

## 3. The kernel roster

**Admitted — 7 modules**, each a leaf after the moves below:

| module | current home | edges it legalises | note |
| --- | --- | --- | --- |
| `db-connection.ts` | **`data/`** | the 2 that blocked §1 | **C14**; 7 `services/` importers |
| `structural/fqn-codec.ts` | `services/` | 4 | pure codec |
| `project-identity/alias-resolver.ts` | `services/` | 4 | leaf once `db-connection` moves |
| `project-identity/identity-guard-installer.ts` | `services/` | 2 | same |
| `search/search-diagnostics.ts` | `services/` | 2 | §5.4 froze it for PR-B — PR-C owns it |
| `search/lexical-search.ts` | `services/` | 1 | same |

**Not admitted — `services/embeddings/index.ts`.** It is a **barrel over 6 sibling modules**
(`../cache/embedding-cache-{contract,factory}.js`, `./cached-provider.js`, `./config.js`,
`./embedding-service.js`, `./provider.js`). Promoting it drags `services/cache/` and four
`embeddings/*` files with it — that is a subsystem move, not a kernel admission, and it would push
PR-C past the size AS-05 set.

Its single edge is `data/vector/base-vector-store.ts:14` → `createEmbeddingProvider`.
**Disposition: invert it — but the first description of how was wrong on both the mechanism and
the size, and both are corrected here.**

**Mechanism.** The call is not constructor-time. `base-vector-store.ts:57` is
`this.embeddingProviderPromise = createEmbeddingProvider({ cache: true })` — a **lazily assigned,
memoised promise field**. So "take the provider as a constructor dependency *instead of*
constructing it" describes neither the current code nor a safe replacement: it would move a lazy
async resolution to construction time and change when provider selection happens.

**The T11 precedent was also mischaracterised.** T11's F4 seam is **additive and optional** —
`injectedDeps.indexManager` with the direct construction retained as the default path, and a parity
test proving behavior identical when nothing is injected. The correct shape here is the same:
**an optional injection point that defaults to today's `createEmbeddingProvider` call**, not a
replacement. That default path is what keeps it behavior-preserving.

**Size, measured — none of it was named before.** `new (TestableVectorStore|PostgresVectorStore)(`
appears **39** times across **5** test files, and
**5** test files `mock.module` the embeddings path
(`base-vector-store`, `embedding-failure-propagation`, `embedding-service`, `memory-service`,
`relation-extractor`). Production surface is small — 1 subclass (`PostgresVectorStore`) and 1
factory call site (`vector-store-factory.ts`) — but the **test** surface is the risk, and it is the
same `mock.module` collision class T13 hit and the plan had not named. The five, enumerated so the
task's write set is not re-derived: `base-vector-store.test.ts` **25**,
`postgres-vector-store.test.ts` **10**, `postgres-vector-store-extended.test.ts` **2**,
`wave-4-sql-bounds.test.ts` **1**, `postgres-vector-store.integration.test.ts` **1** — all under
`packages/core/src/__tests__/`.

> **C17 — the twenty-fourth plan defect, and it is this section's own figure.** This paragraph read
> **40 across 6 test files** until it was re-measured. The sixth file was
> `scripts/__tests__/run-deterministic-coverage.test.ts:55`, where `new PostgresVectorStore()` sits
> **inside a string literal** passed to `expect(classify(...))` — a test of the isolation runner's
> *pattern classifier*, in a different package, that no constructor change can reach. It is not in
> the seam's blast radius, and a task sized from the old figure would have sent someone into
> `scripts/` looking for a call site that does not exist.
>
> **The shape is C16 mirrored.** C16's pattern could not see its subject; this one saw a
> non-subject. Both are positional properties of a pattern rather than errors in its subject list,
> and neither is visible without running the measurement against the real tree.
>
> Note what found it: **§2's own repo-wide rule.** A `packages/core/src`-scoped sweep returns 39/5
> and would have been accidentally right. Going repo-wide is what surfaced the extra file — so the
> rule stands, but it is **incomplete as stated**: a repo-wide sweep must also exclude matches
> inside string literals, comments and fixture text. That is the same qualifier `spec.md` §4.1
> property 3 already puts on `check-stale-pointers`' `EXCLUDED`, arrived at independently.
>
> **Owed back to the parent `spec.md`** alongside C13–C16.

**This gets its own task with T11's discipline** — optional seam, default path retained, parity
test, and violation shapes observed red — not a line folded into a move (R-13).

**Net: the allowlist for this group is empty.** That is what makes AC-1's check discriminating.

---

## 4. GMS-01 AC-4's referent — **26, not 24**

**Decision: AC-4's referent becomes the quote-agnostic 26 edges / 16 files / 7 target modules.**
AC-4's stated "24" is amended in place with its reason, indexed as **C15**.

**Rejected: keep 24.** It is reproducible — measured 24/14 again at `9df5608` — but reproducibility
is not correctness. 24 is a property of a pattern anchored on a **double quote**, not of the tree;
the two invisible edges (`base-vector-store.ts:14`, `postgres-vector-store.ts:26`) are real imports
that were present at `a6216cd` and unchanged since. A contract enforcing 24 while 26 exist has two
edges nobody decided about, and one of them — the `embeddings` edge — is the one §3 just resolved by
inverting. Keeping 24 would have left it invisible.

The check must therefore be written **quote-agnostic**. Recording this because the pattern is the
defect, not the number.

---

## 5. R-09 — the `controller` gap, and the twenty-second plan defect

### 5.1 The first decision here was wrong, and it was a no-op

**This section originally decided: "add `"controller"` to `check-stale-pointers`' `STEMS`",
arguing that widening a subject list is strictly stricter and can only find more.** The reasoning
was sound. The remedy does nothing.

**Measured — patch the gate and re-run it, rather than reading its docblock:**

```bash
sed 's/\["rlm", "search-facade"\]/["rlm", "search-facade", "controller"]/' \
  scripts/check-stale-pointers.ts > /tmp/csp-patched.ts
bun scripts/check-stale-pointers.ts   # PASS — 0 broken, historical exactly at its pin of 28
bun /tmp/csp-patched.ts               # PASS — 0 broken, historical exactly at its pin of 28
```

**Byte-identical.** Zero new matches. The cause is in `POINTER`, which the original decision never
read:

```js
export const POINTER = new RegExp(
  String.raw`(?<![\w-])(?:${STEMS.join("|")})-[a-z0-9-]+?\.(?:test\.)?(?:ts|js)\b`, "g",
);
```

The stem is interpolated as a **prefix** — `<stem>-<rest>.ts`. Every real controller file is
**suffix**-shaped. Measured over `git ls-files`: files matching `controller-*.{ts,js}` = **0**;
files matching `*-controller.{ts,js}` = **6** (`context`, `executor`, `graph`, `memory`, `search`,
plus the barrel `index.ts` which carries no stem at all).

**So R-09 would have been recorded as closed while providing exactly zero coverage of the 61
pointers it names.** That is the twenty-second plan defect, and it is the *third* consecutive one
of the same family — C14 was a criterion that could not see the module it needed
(§2), and this is a gate that could not see the files it was aimed at. **A subject-list entry
cannot fix a positional assumption baked into the pattern.**

Found by the Plan Challenge gate (§8), which patched the checker and ran it. Confirmed
independently before being accepted.

### 5.2 The corrected decision

**Decision: give `POINTER` a second alternation branch for suffix-shaped stems**, keeping the
existing prefix branch byte-identical:

```js
// prefix stems: rlm-search.ts, search-facade-admin.test.ts
// suffix stems: memory-controller.ts, search-controller.ts
String.raw`(?<![\w-])(?:(?:${PREFIX_STEMS.join("|")})-[a-z0-9-]+?` +
          `|[a-z0-9-]+?-(?:${SUFFIX_STEMS.join("|")}))\.(?:test\.)?(?:ts|js)\b`
```

**Why this and not the two alternatives:**

- **Rejected: a PR-C-specific sensor** (the T15/T17/T19 precedent). Still rejected, and for the
  original reason — it duplicates a tested instrument. `check-stale-pointers` already does this
  exact classification against `git log --all`, already has 21 tests, and a second sensor doing the
  same job against a different stem list is the duplicate-table shape that drifted in PR-B's own
  `STATE.md`. **Note this was the critic's preferred remedy**; it is declined on that ground, not
  on cost.
- **Rejected: renaming the six controller files to `controller-*.ts`** so the existing prefix
  branch matches. That is changing the subject to fit the instrument — the exact inversion of
  [[fix-the-subject-not-the-gate]] — and the files are being retired anyway.

**Why the strictly-stricter argument now actually holds.** The prefix branch is untouched, so
`rlm` and `search-facade` readings are unchanged **by construction**, not by measurement. The new
branch is a pure alternation *addition*: it can only add matches. The threshold
(`HISTORICAL_PINNED`) stays `===`, so any movement is a visible edit.

### 5.3 Four properties the task must honour

1. **Base reading frozen before the first structural commit**, not retroactively — the re-pin
   from **28** is only trustworthy while the controllers are still in place.
2. **The re-pin is its own commit**, separate from any move.
3. **Both directions observed red** — [[a-new-sensor-needs-an-observed-red]]. A controller path
   deleted without its citations repointed must fail; a citation deleted must fail.
4. **A no-op control.** Before trusting the reshape, run the *patched* gate against the *unchanged*
   tree and confirm the count **moves**. That single check is what §5.1's original decision failed,
   and it is now a required step rather than an inference.

---

## 6. Sizing — now that the precondition is answered

R-08 asked whether PR-C is two changes wearing one label. With §1 settled it can be answered:

| group | scope | open questions |
| --- | --- | --- |
| **A. Controller retirement** | 6 members, **24** outside importers (22 deep + 1 barrel + 1 dynamic), `./controllers` subpath, `src/index.ts` header, `CLAUDE.md` Architecture section | none — AS-01 decided it |
| **B. Kernel tier + `data → services`** | 7 kernel modules (1 moving out of `data/`), 26 edges, 1 edge inverted via a seam | **none remaining** — §1, §3, §4 closed them |
| **C. `services → tools`** | 4 edges, one symbol (`ToolError`) | none — AC-5 calls it a move |

**All three groups are now question-free. R-08 → closed** — its concern was never file count, it
was that group B carried an unanswered contract question group A would silently absorb, and that
question is answered here, in Design, before sizing, exactly as the precondition required.

**But question-free is not the same as one-PR, and the first draft conflated them.** The Plan
Challenge gate was right to attack this (§8, finding 5). Sizing, measured repo-wide:

| group | files touched (non-test) | test surface |
| --- | --- | --- |
| A. controllers | **9** importers + 6 members + barrel + `package.json` | 14 test files import `controllers/` |
| B. kernel + `data → services` | 6 modules moved + **9** `db-connection` importers incl. one outside `src/` | **39** vector-store constructions / **5** files, **5** `mock.module` sites (§3, as corrected by **C17**) |
| C. `ToolError` | 4 edges | — |

**The precedent is the number that matters.** PR-B was a *narrower* slice of the same umbrella
feature — one subsystem, no contract change — and it touched 37 files, needed **20 tasks**, and
surfaced **19** confirmed plan defects. PR-C changes the layer contract, moves a file out of a
published directory, adds a seam, and reshapes a CI gate.

**Revised position: PR-C is sized as one PR but planned as three independently-revertable phases**,
each green on its own and each a candidate cut point if the review surface gets too large:

- **Phase 1 — kernel tier.** `kernel/` created, 6 modules moved, `create-3072d-table.ts`
  repointed, the embeddings seam (its own task). Closes AC-4. **No controller churn.**
- **Phase 2 — `ToolError`** (AC-5) and the `POINTER` reshape with its frozen base reading (§5.3).
- **Phase 3 — controllers retired**, `./controllers` subpath (AC-6), contract text (AC-2), and
  AC-1's check shipping *with* the restructuring.

R-04 requires each merge to be independently shippable, and every phase above satisfies that. **The
cut decision is deferred to Tasks**, with the file counts above as its input — recorded rather than
resolved, because resolving it needs the per-task write sets Tasks produces.

**Ordering, cheapest-and-most-separable first**, on the parent §12.4 precedent:

1. Kernel tier created; `db-connection.ts` moved (C14) — unblocks everything, no controller churn.
2. The 3 pure leaves promoted; then the 2 project-identity modules (now legal).
3. The `embeddings` edge inverted via the seam.
4. `ToolError` relocated (group C, 4 edges).
5. Controllers retired — the 3 real controllers to `services/`, `ExecutorController` into
   `services/executor/` keeping its exported symbol name (R-06), `./controllers` subpath removed.
6. Contract text: `src/index.ts` header + `CLAUDE.md` Architecture (AC-2), **one description only**.
7. The CI import check (AC-1) — ships **with** the restructuring, not after it.

---

## 7. Risks this Design introduces

| # | risk | mitigation |
| --- | --- | --- |
| R-12 | **`db-connection.ts` leaves `data/`** and is reachable from the published root barrel | Verify against `npm pack --dry-run` the same way AC-6 checks `./controllers`; keep the exported symbol name |
| R-13 | The `embeddings` seam is an **added** seam, and PR-B's only added seam (F4) needed its own task and three observed violation shapes | Give it its own task with the same discipline; do not fold it into a move |
| R-11 | `maxFileLoc` **696**/700 — 4 lines of headroom, and `SearchController` moves into `services/` | Run G-HUB per structural commit, not once at the end |
| R-04 | Squash destroys history | PR #53 and #56 are the only non-squashes in the last eleven merges; `--no-ff` chosen deliberately |

---

## 8. Plan Challenge record

**Full gate run 2026-07-31** — `spec-driven`, a contract change, a published-surface change, more
than 5 modules. Mode: pre-mortem + evidence audit, read-only critic, explicitly instructed to
measure rather than reason from the document.

**Five findings. Three were confirmed by independent re-measurement and are folded into §1–§6
above; two are recorded as accepted.** Every figure below was re-derived before acceptance —
[[subagent-numbers-need-remeasuring]].

| # | finding | verdict | where it landed |
| --- | --- | --- | --- |
| 1 | **`STEMS + "controller"` is a measured no-op** — `POINTER` bakes in a prefix assumption; every controller file is suffix-shaped | **CONFIRMED.** Patched gate output byte-identical to baseline; `controller-*.{ts,js}` = **0** files, `*-controller.{ts,js}` = **6** | **§5 rewritten.** The twenty-second plan defect |
| 2 | **`db-connection.ts` importer count incomplete** — misses `packages/core/scripts/create-3072d-table.ts` and a 5th test file | **CONFIRMED.** Repo-wide: **14** files, **9** non-test / 5 test, not 12 | **§2 corrected**, plus the repo-wide-measurement rule |
| 3 | **The embeddings inversion mischaracterises T11 and is unsized** — T11's F4 was additive/optional, the proposal as worded was a replacement | **CONFIRMED.** `:57` is a lazy memoised promise, not constructor-time. Its replacement sizing was **40** test constructions / 6 files — **itself wrong, corrected to 39 / 5 as C17** (§3): one match was a string literal in another package. **5** `mock.module` sites holds | **§3 rewritten, then corrected** |
| 4 | **The kernel's physical path and the check's basis were never named** — a specifier list would be the rejected allowlist, renamed | **ACCEPTED as a real gap** | **§1 extended** — `packages/core/src/kernel/`, path-prefix rule, leaf-ness enforced not asserted |
| 5 | **"Question-free" was conflated with "one PR"** | **ACCEPTED** | **§6 rewritten** — three revertable phases, cut decision deferred to Tasks with measured inputs |

**What the critic got right that matters most.** Finding 1 is not a residual risk — it is a
reproducible bug in the plan, and it would have shipped as *"R-09 closed"* over zero coverage. It
was found by **patching the checker and running it**, which is the one thing the original decision
did not do. The lesson generalises past this gate: *a subject-list entry cannot repair a positional
assumption baked into a pattern, and only executing the gate can tell you which you have.*

**Where the critic was declined.** It preferred the PR-C-specific sensor for R-09. Declined on the
original ground — it duplicates a tested instrument — with the `POINTER` reshape adopted instead
(§5.2). It also explicitly disclosed **not** re-verifying G-HUB's 696/700, the frozen-anchor and
characterization invariants, or the CHANGELOG/CI mechanics; those remain as measured in `spec.md`
§4 and are unaffected by any finding above.

**Escalation:** the critic returned `escalate_to_full: true`. The full gate had already been
selected, and `serious_findings: revise_plan` was applied — findings 1–3 revised the plan rather
than being appended to it.

---

## 9. Next action

**Tasks.** Its first input is §6's three-phase shape plus the cut decision left open there. Two
things must be sequenced first inside Tasks, because neither can be taken retroactively:

1. **The `POINTER` reshape's frozen base reading** (§5.3), before any controller moves.
2. **The no-op control** (§5.3 property 4) — confirm the reshaped gate's count *moves* against an
   unchanged tree. That check is what §5.1 failed.
