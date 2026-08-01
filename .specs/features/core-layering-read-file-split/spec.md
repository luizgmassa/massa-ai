# Core Layering — `read_file.ts` Split (PR-D) — Specify

- **Slug**: `core-layering-read-file-split` · **PR-D**
- **projectId**: `massa-ai` · **workflowSessionId**: `spec-core-layering-read-file-split`
- **Workflow**: spec-driven (Large — Specify → Design → Tasks → Execute)
- **Parent feature**: `core-layering-god-module-split`. **GMS-02 is defined there**; this document
  does not restate it, it **scopes and amends** it for PR-D and records the measurements PR-D's
  Design starts from.
- **Predecessor**: PR-C (`core-layering-controller-retirement`) — merged as **#59** (`2bea11e`,
  `--no-ff`, two parents `450352b` + `2ea4ebd`), released **v1.17.0** on 2026-07-31, verified
  against `gh release list`, `npm view @massa-ai/core version` and root `package.json` rather than
  inherited. Its verdict is `core-layering-controller-retirement/validation.md` (**PASS**).
- **Successor**: none. **PR-D is the last PR of the umbrella feature**, and closes GMS-02's headline.
- **Status**: **Specify complete**, 2026-07-31. Seven decisions taken with the user, each from
  measured options with the rejected ones recorded (§4). **Full Plan Challenge gate run** — two
  modes, seven findings, all seven independently re-measured and confirmed, six of them revising
  this document (§9.1). **Requirement Closure Gate: closed** — no open requirement question; §7's
  three items are Design decisions with measured inputs, not open requirements. Design not started.

---

## 0. Why this is a separate directory

Same reason PR-C was: one artifact set per PR, cross-referenced, not merged. PR-C's `spec.md` §0
states it and it is not restated here. The parent holds the umbrella analysis (AS-01…AS-06,
GMS-01…GMS-05); this document executes **one requirement** against **one subtree** and carries the
deferrals PR-C accumulated and could not price.

---

## 1. Scope

**In:** GMS-02 **AC-1** and the **GMS-02 headline** · four PR-C deferrals absorbed by user
decision (§4.5) · the state-file sweep no task has owned since PR-C merged (§4.6).

**Out, and on the record as such:**

| item | owner | why |
| --- | --- | --- |
| `.ua/` regeneration — **320** `rlm-` + **222** `controllers/` occurrences across 6 tracked files | **after PR-D**, its own change | §4.4. Deliberately deferred *again*; the deferral now has an address rather than a date |
| `GraphController` / `TracePathTool` divergence | its own change — **R-07** | unifying it is a **behavior** change. Unchanged from PR-C |
| `scripts/run-deterministic.ts` exits 1 | its own change | `validation.md` §5.2: red on `450352b` (125 fail) *and* at PR-C's HEAD (13 fail). Pre-existing, not PR-C's, and not PR-D's — it is a core gate in no task's gate list |
| `mcp-client` `api-key-config-seeded.test.ts` flake | its own change | `validation.md` §5.3. Undiagnosed, reproduced against a commit whose only `packages/core` edit is a docblock |
| **C21's uncovered class** — `check-stale-pointers` inherits `POINTER`'s alphabet, so a moved module whose name carries no stem stays invisible | its own change | `validation.md` §5.4. PR-D does not move a stem-bearing module, so it neither widens nor spends this gap |
| `Code scanning AI findings` — 15/15 failed runs, `CAPIError: 400 The requested model is not supported` | nobody — **not chased** | Verified **not** in `main`'s `required_status_checks`: the live list is `build`, `mcp`, `validate`, both `Structural native tests`, `coverage`. It is not an Actions workflow and cannot be fixed here |
| Splitting `tools/serialize.ts` (438 lines) | not scheduled | It is a shared helper, **not a handler** — it implements no `IToolHandler`, declares no private method and holds no instance state, so §5's gate reads it green on the merits. Size is a symptom; the parent spec's Out of Scope says so about the 910/855/825-line files |
| Fusion/RRF weights, cache layers, retrieval tuning; DB schema; public MCP/REST tool contracts | parent `spec.md` Out of Scope | unchanged |

---

## 2. C28 — the thirty-fifth plan defect, and the first found in PR-D's Specify

**The contradiction.** **AS-06** is an agreed decision (marked `y`) whose stated rationale is:

> *"Its own change, **PR-D**, sequenced after PR-C **so the CI import check PR-C adds is what proves
> the extraction landed**."*

**Measured at `f06b01d`: that check cannot tell the extraction from its absence.**
`scripts/check-core-layering.ts` declares

```ts
export const FORBIDDEN: Readonly<Record<Tier, readonly Tier[]>> = {
  kernel: ["tools", "services", "data"],
  data:   ["services", "tools"],
  services: ["tools"],
  tools:  [],                 // <- every tools -> X edge is legal
};
```

`tools` is first in the declared order, so its row is empty **by the rule**, and the file's own
docblock says so in two places — *"`tools → data` is LEGAL and there are 3 of them … Recorded
because 'tools may only import services' is the plausible tightening, and it would fail this
tree"*, and, decisively:

> *"**Thinness of handlers is GMS-02's requirement, not this check's.**"*

`tools/read_file.ts` holds **4** `tools → services` edges today (`code-compressor`, `event-bus`,
`symbol-graph.service`, `workspace-manager`). Extracting its 392 lines of logic into `services/`
**adds more legal forward edges**. The check reads `PASS — 0 violations` on the tree before the
extraction, after it, and against a tree where no extraction ever happened. **Zero discrimination,
and no other gate in the repository measures handler thinness at all.**

This is the same shape as **C10, C11, C12 and C13**: an instrument named by the plan that cannot
satisfy the criterion it is named for. It differs from those in one way worth stating — the
defective clause is not an acceptance criterion but the **rationale of an agreed assumption**, and
that rationale is what sequenced PR-D after PR-C in the first place. **The sequencing decision
stands on its other leg** (AS-06's *"~390 lines of extraction including a security-sensitive
containment check is too much to ride along with the contract change itself"*, which reproduces at
392 lines — §3). Only the *evidence* claim fails.

**Resolution — C28.** GMS-02 AC-1 gains a deterministic check, and **PR-D ships it** rather than
inheriting one: `scripts/check-tools-thin.ts`, repo-wide over `tools/`, with **zero allowlist
entries**, on `check-core-layering.ts`'s own precedent. **Decided by: the user, 2026-07-31**, from
three presented options with their measured populations (§4.1).

**The amendment is owed back to the parent `spec.md`**, indexed in its *Design and Execute
corrections* table as **C28** — the twenty-eighth correction and the **thirty-fifth** plan defect
across this umbrella feature. That edit is a PR-D task, landing with the work, not ahead of it.

---

## 3. Premises, re-measured at `f06b01d`

Every figure below was re-derived from the shipped tree, not inherited from the parent `spec.md`,
PR-C's artifacts, or PR-C's untracked phase reports. Method is named with each number. **Five
premises did not reproduce and are corrected here.**

| premise | source says | measured at `f06b01d` | verdict |
| --- | --- | --- | --- |
| `tools/read_file.ts` | 707 lines | **707** (`wc -l`) | ✅ holds |
| `read_file.ts` is ~55% domain logic (~390 of 707) | parent `spec.md` Evidence | **392 lines, 55.4%** — 13 private methods (358) + the `MASSA_AI_READ_FILE_MAX_LINES` const (15) + the constructor's `eventBus` subscription (15), classified per section | ✅ **reproduces**, and this is AS-06's surviving leg |
| the CI import check proves the extraction landed | **AS-06** | **False** — §2 | ❌ **C28** |
| `tools/` file count | **31** ("unchanged, confirmed") | **30**. PR-C's T8 moved `tools/enum-validation.ts` to `kernel/` | ❌ stale |
| controllers **6** / services **208** / data **41** | parent `spec.md` Evidence, same row | **0 / 208 / 39**, plus `kernel/` **11**. Same method (`find packages/core/src/<layer> -name '*.ts' \| wc -l`) | ❌ three of four stale |
| `SearchProjectTool`'s **inert** `groupBy` | PR-C phase-3 report §6 | ❌ **does not reproduce.** `format: "tree"` is in the published enum (`search_project.ts:92`), `serialize.ts:67-70` honours `groupBy`, and **5** tools pass it: `get_architecture:114`, `get_references:142`, `impact_analysis:221`, `search_project:128`, `trace_path:218`. It is live, and hardcoded rather than exposed | ❌ **dropped from scope** |
| `check-coverage.ts` still carries a dangling `qwen-fixture.ts` glob half | carried into PR-D's briefing | ❌ **does not reproduce.** `qwen-fixture` occurs **once** in that file, inside the comment recording the entry's *removal*, and no tracked file of that name exists. The array's **one** live dangle is `packages/core/src/services/query/prisma-client.ts` | ❌ **corrected** |
| `data/vector/index.ts` has 0 importers | PR-C phase-1 §5 | **0** | ✅ holds |
| `IHybridSearch` has one implementer that nothing imports | PR-C phase-1 §5 | **2** files name it: `data/vector/hybrid-search.ts` (the 300-line implementer) and `packages/shared/src/types/interfaces.ts` (the declaration). **0** consumers | ✅ holds |
| `BatchCommand` is vestigial | PR-C phase-2 §5 | **2** sites: `tools/batch_execute.ts` (declaration) and `tools/index.ts` (barrel re-export). **0** consumers | ✅ holds |
| `CLAUDE.md`'s "24 migrations" | PR-C `spec.md` §1 | tree has **23** | ✅ holds |
| `CLAUDE.md`'s "five packages" | PR-C `spec.md` §1 | `CLAUDE.md:567` says *"five 'already on npm — skipping' lines"*; **8** publishable packages measured from every non-`private` `package.json` | ✅ holds |

### 3.A The gate's population, and the instrument that got it wrong first

**The first sweep reported 18 of 30 `tools/` files red and was wrong.** Its state-field pattern
matched **interface members**, which sit at the same two-space indent as class fields — so every
handler declaring `fields?: string[]` on its params interface read as holding mutable instance
state. Re-run with class bodies isolated by brace matching:

| file | LOC | private methods | `Map`/`Set` instance fields |
| --- | --- | --- | --- |
| `tools/read_file.ts` | 707 | **11** | **2** (`fileCache`, `projectRootCache`) |
| `tools/index_project.ts` | 352 | **1** (`executeIndexing`, 98 lines) | 0 |
| the other **28** | ≤ 438 | **0** | **0** |

**2 of 30, not 18.** Recorded because the difference is the whole feasibility of §4.1's chosen rule:
at 18 the rule is unshippable without an allowlist, and at 2 it is closable by removal — the same
distinction C19 turned on. *An instrument that reads a population must be verified against a file
it should* not *flag before its count is quotable.*

### 3.B The four caches share an eviction policy — and the first reading of that claimed too much

*(heading corrected by the Plan Challenge gate. It read **"The four caches are one policy"**, which
is the claim §3.B's own body now withdraws — the caches share an eviction rule and differ on TTL and
on invalidation reachability. A heading that overstates the section under it is the same defect as a
criterion that overstates its instrument.)*

`read_file.ts:154` says its LRU *"Mirrors WebController's `WEB_CACHE_MAX_ENTRIES`"*, and
`symbol-graph.service.ts:174` says it mirrors `ReadFileTool`'s. Read by **operator alone** the four
sites disagree; read with the **call position** they do not:

| site | cap | eviction | position | retained | TTL enforced? | external invalidation hook |
| --- | --- | --- | --- | --- | --- | --- |
| `tools/read_file.ts` · `fileCache` | `FILE_CACHE_MAX_ENTRIES = 512` | `while (size >= cap)` | **before** `set` | 512 | **yes** — `CACHE_TTL` read at `:544` | none |
| `tools/read_file.ts` · `projectRootCache` | same 512 | same | **before** `set` | 512 | **NO** — see below | `eventBus "indexing:started"` only (`:167`) |
| `services/symbol/symbol-graph.service.ts` | `PROJECT_ROOT_CACHE_MAX_ENTRIES = 512` | `while (size >= cap)` | **before** `set` | 512 | no | **`clearProjectRoot`**, wired at `production-wiring.ts:105` |
| `services/web/web-controller.ts` | `WEB_CACHE_MAX_ENTRIES = 512` | `while (size > cap)` | **after** `set` (`:135-142`) | **512** | no | none |
| `services/search/file-filter-cache.ts` | `MAX_CACHE_SIZE = 50` | evict **one**, `min(createdAt)` | **after** `set` (`:82`) | **50** | yes (`TTL_MS`, on read) | **`invalidateProject`**, wired at `production-wiring.ts:91` |

Post-insert `> cap` and pre-insert `>= cap` retain the same number. `file-filter-cache`'s entries
are `set` exactly once and never re-inserted — it has no read-promotion — so **`min(createdAt)` is
the first-inserted key**, and evict-one-after-insert coincides with evict-to-cap-before-insert when
size grows by one per insert. Its cap is a `readonly` constant, so the `while` vs single-eviction
distinction has no reachable state where it differs.

**Consequence for the eviction unification: it is behavior-preserving, and the parent spec's *"any
behavior change"* Out of Scope row is not overridden.** This was recorded as a behavior change in the
options presented to the user, on a reading of the **operator alone** that had not checked the call
position — the third premise this session that survived one method and failed another, and the first
one that reached a user decision.

**But the first version of this section claimed more than it had measured, and the Plan Challenge
gate caught it.** It read four axes — operator, cap, call position, read-promotion — and concluded
*"the four caches are one policy."* There are **six**, and on the two it missed the sites are
**not** equivalent:

- **TTL enforcement.** `read_file.ts:148` declares `private readonly ROOT_CACHE_TTL = 300000;` and
  **that constant is never read** — one occurrence in the file, the declaration. Only `fileCache`
  has a real expiry check (`:544`). `projectRootCache` is **LRU-bounded only**.
- **External invalidation reachability.** `production-wiring.ts` composes the post-commit
  project-rename/merge invalidator registry, and it explicitly clears `symbolGraph.clearProjectRoot`
  (`:105`) and `fileFilterCache.invalidateProject` (`:91`). `read_file.ts`'s two caches have no such
  hook — and `production-wiring.ts:67-68` states the reason: *"L1MemoryCache and the read_file tool
  cache are deliberately absent: both are **TTL-bounded and self-evict**."* **That is false for
  `projectRootCache`**, which is the exact data `symbolGraph`'s hook exists to invalidate, in a class
  whose own comment (`symbol-graph.service.ts:174`) cites `ReadFileTool` as the pattern it mirrors.

**Whether that produces an observable stale read is undetermined and must not be guessed.**
`read_file.ts:167` subscribes to `eventBus "indexing:started"` and refreshes the root on reindex, so
a rename that reindexes is covered and a rename that does not may not be. Two readings are
consistent with the source — a live bug, or a dead constant plus a wrong comment over intended
LRU-only behavior — and static reading cannot separate them. **RFS-02 AC-4 makes that a test, taken
before the extraction**, so PR-D neither fixes it silently nor breaks it silently.

**None of this changes the eviction unification's scope** — RFS-02 AC-2 already keeps TTL and
read-promotion local to each site, and the shared module is a function. What it changes is the
confidence: the narrow cap/operator/position claim is measured; *"one policy"* was not, and is
withdrawn. **It remains a claim to prove, not to argue** — RFS-02 makes the proof characterization
tests on all four sites written before the move, on GMS-02 AC-2's own precedent (PR-C's T9).

*Name the metric* now has six members on this one subject, and the gate found the two that were
missing. **This is the ninth consecutive critic on this feature whose mechanism held — and the first
whose figures held while the author's did not** (§3's `groupBy` row, corrected from 4 to 5).

### 3.C One constraint the extraction must not violate

`tools/serialize.ts` is in the **`tools/` tier**. Any extracted module under `services/` that
imports it creates a `services → tools` edge — **the exact class AC-5 was closed to eliminate, and
`check-core-layering` fails on it.** `serializeToolResponse` is called once, at
`read_file.ts:338`, inside `handle()`, and must stay there. Named here because it is invisible until
the build breaks, and because "move the presentation logic too" is the plausible tidy-up.

---

## 4. Decisions taken in Specify

All five by **the user, 2026-07-31, in session**, each presented with measured options. Rejected
options are recorded with the measured reason each failed, because a bare *"Resolved"* is the
defect class `validation.md` §15 finding 2 named and this feature's method forbids.

### 4.1 GMS-02 AC-1's sensor — a repo-wide gate **plus** a this-PR acceptance reading

**Chosen.** `scripts/check-tools-thin.ts` ships as a CI gate over all 30 `tools/` files, with the
rule **{no private method, no `Map`/`Set` instance state}** and **zero allowlist entries**. Its
frozen base reading is taken **before** the first extraction commit. Separately, a per-file
acceptance reading not shipped as a gate: `read_file.ts` 707 → ≤ N lines, private methods 11 → 0,
`Map` fields 2 → 0, the named extracted modules present, and the public MCP/REST schema
byte-identical.

**Rejected:**

1. **The repo-wide gate alone.** Rejected on **C21's measured shape** — a gate can read `PASS` by
   not looking at the subject, which is how `check-stale-pointers` reported `0 broken` on a tree
   where a cited file had already been deleted. Without the exact `707 → N` / `11 → 0` reading there
   is nothing that says *this file* moved, only that nothing is over a line.
2. **The per-file acceptance reading alone, no shipped gate.** Cheapest, and it would close AC-1.
   Rejected because GMS-02's **headline** is *"no file under `tools/` contains orchestration or
   domain logic"*, and closing a headline with no standing sensor means the next handler regrows it
   silently — the failure this umbrella feature exists to eliminate.

### 4.2 `index_project.ts` — the gate's other subject, closed by removal

**Chosen.** PR-D extracts `executeIndexing` (98 lines, `:254-351`, reaching `EtlPipeline` and
`indexJobTracker`) into `services/`, so the gate ships green at **0 of 30** with no allowlist. The
file's remaining `private contextualSearch` field is not a `Map`/`Set` and is untouched by the rule.

**Rejected:**

1. **Narrow the rule to `Map`/`Set` instance state only.** `index_project.ts` passes at 0 today, so
   PR-D would stay one file. Rejected because the gate would then read `PASS` on a 352-line handler
   whose own docblock describes `executeIndexing` as a pipeline orchestration
   (*"discover → parse → resolve → load"*) — the gate green on exactly the file still violating the
   requirement.
2. **A per-file LOC ceiling on `tools/`, on G-HUB's precedent.** Simpler and already precedented.
   Rejected on the measured distribution: any ceiling catching `index_project.ts` (352) also catches
   `tools/serialize.ts` (438), which is a shared helper and not a handler. Size is a symptom — the
   parent spec's Out of Scope says exactly that about the 910/855/825-line files.

### 4.3 Where the 392 lines land — `kernel/` for the leaf, `services/file-read/` for the rest

**Chosen.** The insertion-order LRU is promoted to `kernel/` as an **eviction function**, not a
cache class; everything else moves to a new `services/file-read/`. **All four** call sites repoint.
`kernel/` goes 11 → 12.

**The module is a function, not a class, and that is load-bearing.** `file-filter-cache` carries a
TTL and no read-promotion; `web-controller` and the other two carry read-promotion and no TTL. A
shared *cache class* would impose one policy on all four and **would** be the behavior change §3.B
shows the eviction itself is not. A shared `evictOldest(cache, cap)` leaves every site's TTL and
promotion policy local.

**Rejected:**

1. **One `services/file-read/` for all of it, no unification.** Smallest write set, and R-07 is the
   standing precedent for refusing a silent unification. Rejected because the LRU is the one piece
   of the 392 lines that is genuinely two-tier (`tools/` + `services/`), so `kernel/`'s own
   admission rule — *"cross-cutting leaves … needed by two tiers"* — is met by it and by nothing
   else in the extraction. `checkPathContainment` has exactly **one** consumer tier and therefore
   does **not** qualify.
2. **Spread into existing `services/` homes and unify the duplicates.** `detectLanguage` would join
   `services/compression/code-compressor.ts`'s; `extractImports` would join
   `services/etl/stages/parse.ts`'s. Rejected because each merge is a **behavior** decision — do the
   two language maps agree? do the two import regexes? — and neither was measured. R-07 is the
   precedent. **Both duplications are logged in §6 rather than merged.**

### 4.4 `.ua/` regeneration — after PR-D, its own change

**Chosen.** Measured at `f06b01d`: 6 tracked `.ua/` files carrying **320** `rlm-` and **222**
`controllers/` occurrences, every one of them inside `check-stale-pointers`' `EXCLUDED` and
therefore under no gate. `docs/ONBOARDING.md:83-87` carries the marked hand-edit against generated
output, and says regeneration is deferred until after PR-D.

**Rejected: folding it into PR-D.** It would close GMS-04 AC-3's population and let ONBOARDING drop
its hand-edit marker, and PR-D is the last PR of the umbrella. Rejected because the generator's own
scope is undecided — the graph analyzed **733 of 2094** tracked files — and putting 5 MB of
regenerated JSON in the same review surface as a security-sensitive extraction is R-08's shape
("two changes wearing one label") on a PR that already carries five.

**The deferral now has an address**: it is named in §1, it is not "after PR-D" as an open date, and
`docs/ONBOARDING.md`'s marker text must be updated in PR-D to say so rather than to point at a PR
that will have merged.

### 4.5 The PR-C deferrals PR-D absorbs — all four groups

**Chosen.** PR-D takes the dead/vestigial sweep, the `services/graph` vs `services/symbol` naming
trap, `check-coverage.ts`'s path-keyed `EXCLUSIONS`, and `CLAUDE.md`'s figure drift.

**Two of the four carry an unresolved sub-question that Design owes, not Specify** — §7.

### 4.6 The state files land with the work, not ahead of it

**Chosen.** `HANDOFF.md`, `STATE.md`, `FEATURES.json` and the parent `spec.md`'s Status line are all
stale. On PR-C's **T16** precedent a correction lands in the commit that carries the work — and
**the Specify commit is that work**, so the sweep landed here rather than waiting for Execute. The
reason is this feature's own history: PR-C's phase-3 record found *"five status lines still said
'Execute not started. No code written.' about a branch carrying 21 commits"*, and a handoff to a
fresh session that reads a stale `STATE.md` is exactly how that happens. **Registering PR-D in
`FEATURES.json` at Specify time is the same correction applied forward** — PR-C's Specify (#56)
touched `HANDOFF.md`, its own `spec.md` and `STATE.md` and *skipped* `FEATURES.json`, which is why
T16b existed at all.

Measured staleness at `f06b01d`, five places:

| file | says | truth |
| --- | --- | --- |
| `.specs/HANDOFF.md:3` | *"complete and validated; **awaiting merge**"* | merged as #59, released v1.17.0 |
| `.specs/HANDOFF.md:8` | *"Remaining: merge, `--no-ff` (R-04)"* | done — `2bea11e` has two parents |
| `.specs/project/STATE.md:200` | `## Active — … (PR-C)` | PR-C is Previous; PR-D is Active |
| `.specs/project/FEATURES.json` | PR-C `status: in_progress`, `notes` ending *"Awaiting merge."* | merged. `phases.execute` is already `true` |
| `.specs/project/FEATURES.json` | parent `core-layering-god-module-split` `phases.execute: false` | PR-B and PR-C both executed |
| parent `spec.md:11` | *"**PR-C** … **in Execute**"* | merged and released |

**`active_feature: skills-directive-dedup` is NOT stale and must not be touched** — it names a
feature genuinely paused at T5 of 12 on the user's instruction, verified against `STATE.md`'s
`## Current` section. This was checked before acting on it, on PR-C's T16b precedent, and is the
second time the check has been run and the second time it has held.

---

## 5. Requirements

GMS-02 is defined in the parent `spec.md`. PR-D closes **AC-1** and the **headline**; AC-2 was
PR-C's and is closed (`validation.md` §1). The `RFS-*` IDs below are local to PR-D and cover the
absorbed deferrals, which have no parent requirement.

**RFS-06 is printed out of numeric order, directly after RFS-02, and that is deliberate.** It was
added last, by the Plan Challenge gate, and it is RFS-02's twin: both say *instrument the thing
before you move it, and prove the instrument bites today*. Renumbering to put it last would separate
the two requirements a reader most needs to read together, and renumbering the others would break
every reference in `design.md` and `tasks.md` before those documents exist. **Numeric order is not
reading order here** — noted because a verifier scanning for RFS-06 at the bottom will not find it.

### GMS-02 AC-1 — `tools/read_file.ts` sheds non-schema, non-delegation logic

*(inherited by C13; its sensor replaced by **C28**, §2)*

**Evidence is two readings, not one.** The shipped gate (RFS-01) proves the property holds and keeps
holding; the acceptance reading proves **this file moved**, which a gate cannot say:

| reading | before | after |
| --- | --- | --- |
| `read_file.ts` private methods | **11** | **0** |
| `read_file.ts` `Map`/`Set` instance fields | **2** | **0** |
| `read_file.ts` LOC | **707** | ≤ N — N fixed in Design against the retained schema (103) + interfaces + delegation `handle()` |
| named extracted modules exist and are imported | — | present |
| MCP `read_file` `inputSchema` + REST `/file` response shape | — | **byte-identical** |

### GMS-02 headline — no file under `tools/` contains orchestration or domain logic

**Closed by PR-D**, jointly with PR-C per C13. The check is RFS-01 at **0 of 30**.

### RFS-01 — a deterministic thinness check ships with the restructuring it validates

**AC-1**: `bun scripts/check-tools-thin.ts` exits 0, reports its examined population on a PASS (so a
check that resolved nothing cannot read the same as a clean one — `check-core-layering.ts`'s
`edgesExamined` precedent), and runs in CI inside the **`build`** job, which is in `main`'s live
`required_status_checks`.
**AC-2**: **Zero allowlist entries**, no exemption parameter, no suppression flag — on
`check-core-layering.ts`'s stated ground that an allowlisted exception is indistinguishable from a
new violation.
**AC-3**: Its **frozen base reading is taken before the first extraction commit** and records
**2 of 30 red** (`read_file.ts`, `index_project.ts`). It cannot be taken retroactively — G-HUB and
PR-C's T0 are both precedent.
**AC-4**: **Both directions observed red on purpose**, plus an **inert control** that moves nothing:
a private method added to a currently-green handler must FAIL; a `Map` field added must FAIL;
~~a legal public method added must stay PASS **while still being counted**~~ → **a file declaring no
handler — `serialize.ts`'s shape — must stay PASS while still being counted**, and a comment-only
edit must leave the reading unchanged. A new sensor is not quotable until it has failed on purpose.
**Amended by C41**, `tasks.md` §10.5, at Execute. The struck clause is **falsified by C32**: this
criterion was written against the *"no private method"* predicate, and C32 replaced it with *"a
declared function body"*, under which visibility is irrelevant and a public method is a violation.
Measured — a public method reads **RED** — and `design.md` §6.5 lists *"a public method"* among the
shapes C32's clause subsumes, while `design.md` §6.6 property 4 had already substituted
`serialize.ts` as the control **without striking this clause**. Three documents against one clause;
the structural requirement wins.
**AC-5** *(added by the Plan Challenge gate)*: the fail-shape list also covers the **evasion shapes
§3.A had to probe for**, since a rule stated over `private` and `Map`/`Set` says nothing about the
ways the same thing is expressible: a getter, a `#private` field, a `static` member, an
arrow-function class property, a `Map` assigned inside a method to an untyped field, and an
object-literal handler that is not a class. ~~**All six measured absent from `tools/` today**~~ →
**thirteen shapes, all measured absent from `tools/` today** — which
is why they are a *future* regrowth path rather than a present violation, and why leaving them out
would be C21's shape (a gate reading PASS by not looking) aimed forward instead of back.
**Amended by C40**, `tasks.md` §10.5, at Execute, in two ways. **The count**: `design.md` added three
more shapes to this list in place (§6.4 item 2's module-level `Map`, §6.4 item 4's brace-in-a-string
fixture, §6.5's constructor-body closure) without restating *"six"* here, and `tasks.md` T4b
enumerates ten — so all three documents carried a different number and only this one still said six.
The suite settles it at **thirteen** declared-body shapes plus the state and ceiling cases.
**The sixth shape**: the object-literal handler was **measured PASS** against the gate as T4a shipped
it — with a 200-line `handle()` *and* a module-level `Map` — because the walk returned early with no
class to check. That is precisely the failure this clause's own last sentence forbids, so the gate's
population was widened to admit an object literal that claims the interface by annotation,
`satisfies` or `as`. The widened reading over the live tree is **byte-identical**, so AC-3's frozen
base is untouched.
**AC-6** *(added by the Plan Challenge gate)*: the script's docblock **names what it does not
certify** — that a delegating `handle()` reads identically whether its delegate is correct or subtly
wrong, so this gate is a *structural* check and carries no claim about the behavior of the extracted
modules. This is C28 one level down, and `check-core-layering.ts`'s own practice of naming its blind
spots (*"`tools → data` is LEGAL … Recorded because …"*) is the precedent.

### RFS-02 — the LRU unification is proven behavior-preserving, not argued

**AC-1**: Characterization tests covering **all four** cache sites exist and pass **before** the
extraction, and pass **unmodified** after it — byte-identity of the test files asserted across the
move, on GMS-02 AC-2's own evidence shape (`validation.md` §1: ancestry + SHA-256, not "the tests
are green now").
**AC-2**: The shared module is an **eviction function**, not a cache class. No site's TTL or
read-promotion policy moves.
**AC-3**: ~~`kernel/lru-cache.ts` imports nothing relative — kernel leaf-ness is enforced by
`check-core-layering.ts`'s clause 1, not asserted.~~ → **`services/cache/lru-evict.ts` imports
nothing at all, and that is asserted by the module's own unit test rather than enforced by any
tier rule.** **Amended at T6** (`tasks.md` §10.7) on the C37/C41 precedent, because this clause
names a module PR-D does not build and an enforcement mechanism it does not get. **C30**
(`design.md` §5.2) moved the LRU out of `kernel/` — the tier's admission rule is *"serves ≥ 2
tiers"*, kept by 11 of 11 shipped members, and this module serves `services/` alone after Phase 3 —
and §5.2 recorded the consequence for this criterion **without striking it here**, so for three
tasks the spec asserted a CI clause that could never run. *A criterion superseded in substance does
not strike itself* (C41, verbatim, second occurrence). **The loss of enforcement is real and was
measured at T6, not argued**: of six mutations of the shipped module, the added-import one is
**invisible** to T1's characterization oracle even with T7's repoint applied, as are two others — no
amount of exercising the call sites can see this property, so the unit test is not a weaker sensor
than the kernel clause would have been, it is the **only** one. Recorded rather than glossed (R-29).
**AC-4** *(added by the Plan Challenge gate — §3.B)*: `ReadFileTool.projectRootCache`'s behavior
across a project rename/merge is **pinned by a test taken before the extraction**: warm the cache,
run the rename path, read again, and record what is served. Whichever answer it gives is the
characterization. The test settles which of the two readings of `ROOT_CACHE_TTL` is true, and it is
the only thing that stops PR-D silently fixing a bug (a behavior change inside a
behavior-preserving PR) or silently breaking one (a regression under a green structural gate).
**If it shows a stale read, that is a defect PR-D logs and does not fix** — parent `spec.md` Out of
Scope, R-07's precedent — and `production-wiring.ts:67-68`'s comment is corrected to say what is
actually true.

### RFS-06 — the containment extraction is instrumented before it moves, not after

*(added by the Plan Challenge gate, red-team lens)*

`checkPathContainment` (`read_file.ts:387-448`) is 62 of the 392 lines and the only
security-sensitive one. RFS-01's gate is structural and **cannot** distinguish a correct delegate
from a widened one (RFS-01 AC-6); `check-core-layering.ts` cannot either. So the containment check's
only real sensor is its tests, and **two mutation shapes that a mechanical move plausibly introduces
are unguarded by all seven existing tests** — measured, not argued:

| shape | killed by an existing test? | the test that would |
| --- | --- | --- |
| `rel.startsWith("..")` narrowed to `rel.startsWith("../")` | **No.** The one "outside" fixture is a *sibling* directory, whose `rel` is `../<name>` and is caught either way. **No test targets `target === path.dirname(root)`** — measured: the string `dirname` does not occur in the suite | request `path.dirname(<project root>)` with a `projectId` set; expect rejection |
| the env allowlist read hoisted from **call time** to construction time | **No.** All 7 tests construct at `:98,120,131,144,157,182,209`; the env test sets at `:180` and constructs at `:182`, so the two readings are indistinguishable to it | construct **once**, read under one env state, mutate `MASSA_AI_READ_FILE_ROOTS`, read again on the **same instance** |
| `sanitizeFilePath` dropped from `resolveFilePath`'s projectId branch | **Ambiguous.** `:153-173`'s own comment says it accepts *"either ENOENT … or a containment error"* — it deliberately cannot tell which of two independent defenses caught the traversal, so dropping one silently loses defence-in-depth | ~~assert the returned `absolutePath` carries no literal `..` segment, independent of containment~~ → **assert the resolved path is still under the project root** (`path.relative(root, absolutePath)` does not start with `..`) and that the **content served** is the in-root file's — **amended by C37**, `tasks.md` §10.2, at Execute. The struck assertion is **vacuous**: `resolveFilePath`'s only two non-null exits (`:370`, `:379`) both return `path.resolve(...)`, which normalizes `..` away unconditionally, so it reads identically with and without the sanitize call. Proven, not argued — a probe written to this clause's letter **passes under the mutation the clause exists to catch**. *"Independent of containment"* survives and is honoured by putting the escaped directory on `MASSA_AI_READ_FILE_ROOTS` so containment permits both candidates |

**AC-1**: All three tests exist and pass **against the pre-extraction code** — proving they hold
today — before the extraction commit, and pass **unmodified** after it.
**AC-2**: The teaching-error text (`read_file.ts:443-447`) is unchanged, including that it
enumerates roots only and never a host path.
**AC-3**: The env allowlist is still read **at call time**. This is the one property with no
structural witness and an explicit comment (`:400-402`) asserting it.

**Logged, not tested:** the cross-drive `path.isAbsolute(rel)` guard at `:433` is **dead on every CI
run** — `ci.yml`'s only runners are `ubuntu-latest` and `macos-14`, and on POSIX `path.relative`
between two absolute paths is never itself absolute. Adding a Windows leg is out of scope; recording
that the branch is unexercised is not.

### RFS-03 — the extraction does not reintroduce a backward edge

**AC-1**: `bun scripts/check-core-layering.ts` exits 0 after every structural commit, and its
`edgesExamined` figure is recorded per commit rather than only at the end.
**AC-2**: No module under `services/file-read/` imports `tools/serialize.ts` or anything else under
`tools/` — §3.C.
**AC-3**: The allowlist stays **empty**. Any edge that "has to" be legal is closed by moving the
module.

### RFS-04 — the vestigial removals are priced as published surface

All three measure **0 consumers** by every method tried — static import, dynamic `import()`,
`mock.module`, string-built specifier, both transports. **Reachability is per-item and is not
uniform**, which the first draft asserted as one blanket sentence and the Plan Challenge gate
corrected:

| item | reachable from a published entry point? | path |
| --- | --- | --- |
| `IHybridSearch` | **yes** | `@massa-ai/shared` `exports["."]` → `dist/index.d.ts`; `src/index.ts:10` `export * from "./types/interfaces.js"` |
| `BatchCommand` | **yes** | `@massa-ai/core` `exports["./tools"]` → `dist/tools/index.d.ts`; `tools/index.ts` re-exports it by name |
| `data/vector/index.ts` | **no** | `@massa-ai/core`'s `exports` are exactly `.`, `./tools`, `./services` — there is no `./data`. The root barrel does not import it; it reaches `PostgresVectorStore` through `services/vector/vector-store-factory.ts` instead |

So `data/vector/index.ts` has **zero reachability**, not merely zero current consumers — a materially
cheaper removal than the other two, and the semver framing in AC-2 must not price all three alike.

**A trap the next executor will hit: there are two files named `hybrid-search.ts`.**
`data/vector/hybrid-search.ts` is the removal target with 0 consumers; `services/search/hybrid-search.ts`
is live, heavily tested and `mock.module`-ed by name in at least two suites. **A bare-filename search
returns the wrong file's consumers and makes the dead one look alive** — the same failure that once
had `GraphController` recorded as dead code while it was live in both transports. Every RFS-04
verification command must be full-path-qualified.

**AC-1**: Each removal is verified against a **cache-forced** `npm pack --dry-run`, not a stale
`dist/` — PR-C's `validation.md` §1 AC-6 is the precedent, and a `turbo` cache replay satisfying a
published-surface check is a recorded failure mode.
**AC-2**: The CHANGELOG heading is chosen **deliberately before merge**, with who chose and what was
rejected written down — **R-10's shape**, and PR-D is the second application. Removing published
surface is a breaking change by strict semver regardless of consumer count; PR-C's own decision
rejected `### Removed`/major on a measured zero consumers and that reasoning must be re-taken, not
inherited. **It is re-taken per item**, on the reachability table above — the two reachable symbols
and the unreachable barrel do not carry the same semver weight.
**AC-3**: The `hybrid-search.ts` name collision is resolved by full path in every command that
produces a figure for this requirement, and the figure states which of the two files it read.

### RFS-05 — the record is true when PR-D merges

**AC-1**: The six stale statements in §4.6 are corrected in the commit that carries the work.
**AC-2**: **C28** is amended into the parent `spec.md` in place *and* indexed in its *Design and
Execute corrections* table, on the C1–C12 convention, so an independent verifier can tell an amended
criterion from an original one.
**AC-3**: The parent `spec.md`'s stale layer figures (§3: 31 → 30, 6 → 0, 41 → 39, plus `kernel/`
11) are corrected **with their method named**, since the row claims *"unchanged, confirmed"*.
**AC-4**: `scripts/check-coverage.ts`'s **one** live dangling exclusion is closed, and the
path-keying class it belongs to is addressed rather than the instance — §7.
**AC-5**: `CLAUDE.md`'s "24 migrations" (tree: 23) and `:567`'s "five … skipping lines" (measured: 8
publishable packages) are corrected.

### GMS-05 — inherited unchanged

AC-1 (characterization first), AC-2 (coverage floor, **no new exclusion**), AC-3 (no test weakened,
skipped or deleted), AC-4 (`lint`, `type-check`, `build`, `test`, `test:scripts`, `test:plugins`
green). **AC-2 has a live edge here**: `read_file.ts` is currently one file under the 90% floor and
splitting it creates five or six new files that must each clear it independently — the DEBT-02 gate
is per-file, and `2ea4ebd` is the measured precedent for a `git mv` putting a file under the floor
for the first time.

---

## 6. Logged, not merged

Recorded so a future reader knows they were seen and deliberately left. Each is a **behavior**
question inside a behavior-preserving PR — R-07's class.

| duplication | sites | why not merged here |
| --- | --- | --- |
| language detection | `tools/read_file.ts:645-681` (28-entry extension map) and `services/compression/code-compressor.ts` | whether the two maps agree is unmeasured; merging them without measuring is a silent behavior change |
| import extraction | `tools/read_file.ts:683-707` (6-language regex table) and `services/etl/stages/parse.ts` | same — two regexes, no measurement that they classify identically |
| `MASSA_AI_READ_FILE_MAX_LINES` / `MASSA_AI_READ_FILE_ROOTS` absent from `turbo.json`'s 24-entry `passThroughEnv` | AD-010 says adding a `MASSA_AI_*` knob means editing that list | **No failure observed today**: both read-file suites set the var in-process (`read-file-containment.test.ts:180`, `read-file.test.ts:44`), so nothing arrives `undefined`. It is a convention gap, not a live defect, and is recorded as such rather than fixed under a criterion it does not fail |
| `ReadFileTool.projectRootCache` is outside the project-rename invalidation registry while its declared mirror is inside it | `production-wiring.ts:67-68` vs `:105`; `ROOT_CACHE_TTL` dead at `read_file.ts:148` | **A candidate live bug in the file PR-D moves.** RFS-02 AC-4 characterizes it before the move; fixing it is a **behavior** change and belongs to its own change — §3.B |
| two files named `hybrid-search.ts` | `data/vector/` (dead) and `services/search/` (live) | a bare-filename search returns the wrong one's consumers — RFS-04 AC-3 |
| the cross-drive `path.isAbsolute(rel)` branch at `read_file.ts:433` | `ci.yml` runs `ubuntu-latest` + `macos-14` only | dead on every CI run; unexercised, not wrong. Adding a Windows leg is out of scope — RFS-06 |

---

## 7. Decisions Design owes, with their measured inputs

PR-D is **not sized** until these are recorded, each with its rejected alternative — PR-C's §9
precedent, where three such preconditions gated sizing and produced C14, C15 and C16.

1. **`services/graph/` (7 files, memory-relation) vs `services/symbol/` (12 files, symbol graph +
   the controller PR-C moved there).** Rename one, or document the distinction and leave the paths?
   A rename's cost is the importer fan-out of 7 or 12 modules; documenting costs two files and
   leaves the trap. `CLAUDE.md` already calls it *"a trap for a newcomer"*, which is the
   documented-and-left option already taken once.
2. **`check-coverage.ts`'s `EXCLUSIONS` keying.** The array is keyed by literal path strings, so a
   `git mv` silently orphans an approved entry — measured **1** live dangle
   (`services/query/prisma-client.ts`, orphaned by PR-C's T2b). `2ea4ebd` fixed the *symptom* by
   adding four lines of test rather than repointing the entry, deliberately. The class fix and the
   instance fix are different changes: repointing the one entry leaves the next `git mv` silent,
   while making the array `git mv`-proof is an edit to a gate. **Note `check-coverage.test.ts`
   already pins that every entry is a path the gate would otherwise measure** — so a dangling entry
   is a pinned invariant's blind spot, not an unguarded one, and Design must read that test before
   choosing.
3. **N — the LOC number in GMS-02 AC-1's acceptance table.** It cannot be picked before the module
   boundaries are drawn. Design fixes it against the retained surface (103 lines of schema + 35 of
   interfaces + a delegation-only `handle()`), and it must be a **measured consequence** of the
   split, not a target the split is shaped to hit.

---

## 8. Risks

| # | risk | why it is real here | status |
| --- | --- | --- | --- |
| R-04 | **A squash destroys the commit history** | Inherited and unchanged. PR-C honoured `--no-ff`; the repo's default merge button is still squash | **Open — highest-likelihood process risk** |
| R-07 | The `GraphController`/`TracePathTool` divergence is fixed by accident | Inherited. PR-D touches neither, but §6's two duplications are the same class and the tidy-up temptation is live | Open |
| R-20 | **The gate's frozen base cannot be taken retroactively** | G-HUB could not be, and neither could PR-C's T0 pointer reading. RFS-01 AC-3 sequences it before the first extraction commit | **New** |
| R-21 | **The LRU unification is behavior-preserving by a reading that already failed once** | §3.B's conclusion rests on call position, which the first reading did not check. RFS-02 AC-1 makes the proof characterization tests written before the move, not the argument | **New** |
| R-22 | **`checkPathContainment` is security-sensitive and its error text is a contract** | 62 lines implementing Wave 5 FR-12 / AD-W5-006, returning a *teaching error* that enumerates valid roots. GMS-05 AC-3 forbids weakening a test to accommodate the move; a containment check whose message changes shape breaks `read-file-containment.test.ts` without breaking the check | **New** |
| R-23 | **The DEBT-02 floor is per-file, and PR-D creates five or six new files** | `2ea4ebd` is the measured precedent: a `git mv` put `prisma-client.ts` under the floor for the first time and failed CI. Every extracted module must clear 90% on its own, and GMS-05 AC-2 forbids a new exclusion | **New** |
| R-24 | **PR-D carries five distinct changes** — the extraction, the gate, `index_project`, the vestigial sweep, and the record sweep | R-08's shape at the scale that produced it. §7's sizing decision is owed to Design and the cut decision to Tasks, on PR-C's precedent | **New** |
| R-25 | **PR-C planned 104 files and shipped 222 (2.1×); PR-B planned 37 and found 19 plan defects** | Any PR-D estimate should be read against that multiplier. Phase-1 alone ran 2.6× | **New** |
| R-26 | **The blocking coverage gate creates the incentive to write shallow tests on the highest-stakes new file** | `coverage.yml` is in `main`'s live `required_status_checks` and enforces 90% **per file**; GMS-05 AC-2 forbids a new `EXCLUSIONS` entry. The only compliant response to a red number is more tests, quickly — and quickly is how a security function gets happy-path coverage. `2ea4ebd` is the measured precedent for the red arriving at all | **New — raised by the gate.** Mitigated by RFS-06 AC-1 sequencing the containment tests **before** the extraction commit, so they are never written under a red gate |
| R-27 | **A squash merge destroys RFS-01's own evidence** | R-04 and RFS-01 AC-3 were recorded in separate sections with no stated dependency. The frozen `2 of 30` base reading is a claim about **history**, and PR-C's `validation.md` §1 shows the evidence for such a claim is ancestry plus byte-identity — both unreconstructable after a squash, exactly as they were for G-HUB | **New — raised by the gate.** Confirm the merge commit has two parents before treating RFS-01's baseline as settled, on `2bea11e`'s precedent |

---

## 9. Method, carried forward

Applied, not restated — parent `spec.md` §8 and PR-C `spec.md` §8. What it produced in this Specify
alone, before any code:

- **Five premises re-measured and failed**, three of them in the briefing that opened this session:
  the `qwen-fixture` dangle, `SearchProjectTool`'s inert `groupBy`, and three of four layer counts.
- **One agreed assumption's rationale falsified** — C28, found by reading the gate AS-06 names
  rather than trusting that it does what AS-06 says.
- **One measurement instrument wrong before it was right** — the 18-of-30 population, corrected to
  2-of-30 by isolating class bodies. *The gate rule's feasibility turned on it.*
- **One user decision taken against a premise this session had got wrong**, caught and reversed
  before it reached a document: the LRU sites' `>` vs `>=`, which dissolves once call position is
  read. Recorded in §3.B rather than quietly corrected, because the correction is the evidence that
  the rule works.

### 9.1 Plan Challenge gate — full, two modes, 2026-07-31

Mode selected from `references/the-fool/mode-selection-guide.md`: the domain maps to **Architecture**
(pre-mortem primary, red-team secondary) while the artifact is 40+ quantitative claims, which maps to
**Evidence Audit** — and the guide calls for multi-mode when *"the domain spans two mapping
categories (e.g., a security architecture decision)"*. PR-D is exactly that, so both ran, read-only,
independently, against the standing instruction to **measure rather than reason**.

**Seven findings, all seven re-measured by the main agent before acceptance, all seven confirmed.**
Six revised this document rather than being appended to it; one was already true.

| # | finding | severity | landed |
| --- | --- | --- | --- |
| 1 | §3.B measured four axes and concluded over six. `ROOT_CACHE_TTL` is **dead** and `projectRootCache` sits outside the invalidation registry its declared mirror is inside | **critical** | §3.B rewritten; **RFS-02 AC-4**; §6; the "one policy" claim withdrawn |
| 2 | `checkPathContainment` — the only security-sensitive 62 lines — had a risk note and no instrumentation AC, while the LRU had a full one | **critical** | **RFS-06**, with three measured mutation shapes and the test that kills each |
| 3 | `groupBy` is passed by **5** tools, not 4 — `trace_path.ts:218` omitted | high | §3 corrected. **The author's figure, not the critic's** |
| 4 | `check-tools-thin.ts` inherits C28's blind spot one level down: a delegating `handle()` reads identically whether the delegate is correct or widened | high | **RFS-01 AC-6** — the script names what it does not certify |
| 5 | The blocking per-file coverage floor plus "no new exclusion" is the incentive structure that produces shallow tests on the new security module | high | **R-26**; RFS-06 AC-1 sequences the tests before the extraction |
| 6 | RFS-04's "all reachable from published entry points" is true for 2 of 3; and two files are named `hybrid-search.ts` | medium | RFS-04 per-item reachability table; **AC-3** |
| 7 | RFS-01 AC-4's fail shapes omit the evasion forms §3.A itself had to probe for; R-04 and RFS-01 AC-3 have an unstated dependency | low / medium | **RFS-01 AC-5**; **R-27** |

**What the gate got right that matters most.** Findings 1 and 2 are not residual risks — 1 is an
unmeasured axis concealing a candidate live bug **in the file PR-D moves**, and 2 left the one
security-sensitive extraction in the whole PR governed by a risk note while the cache eviction had a
characterization AC. Both would have shipped.

**Where a critic was corrected.** One reported `.ua/` at 65 files / 2128 / 1124 on a first pass,
against the true 6 / 320 / 222, and re-derived it correctly only after scoping to `git ls-files` —
a live instance of the same tooling trap this repo already documents, found inside the audit rather
than recalled. **Ninth consecutive critic on this feature whose mechanism held; the first whose
figures held while the author's did not.**

`escalate_to_full` was already at full depth in both passes. `serious_findings: revise_plan`
applied.

---

## 10. Next action

**Design.** Its first deliverables are §7's three decisions, each with its rejected alternative.
**PR-D is not sized until all three are recorded.**

**Three steps must be sequenced first**, inside Design or at the top of Tasks, because none can be
taken retroactively:

1. **RFS-01 AC-3's frozen base reading** — `2 of 30` — before any extraction commit.
2. **RFS-02 AC-1 and AC-4's characterization tests** on all four cache sites, including the
   `projectRootCache` rename pin, before the LRU moves.
3. **RFS-06 AC-1's three containment tests**, passing against the **pre-extraction** code, before
   the containment module moves — and specifically before `coverage` can go red and turn "write
   tests" into "write tests fast" (R-26).

