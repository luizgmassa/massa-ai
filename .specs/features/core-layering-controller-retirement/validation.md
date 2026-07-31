# Core Layering — Controller Retirement (PR-C) — Validation

- **Slug**: `core-layering-controller-retirement` · **PR-C** · task **T18**
- **Branch**: `spec/pr-c-execute`, range `450352b..HEAD` — 22 commits
- **Date**: 2026-07-31
- **Author ≠ verifier**: the verification pass was run by an independent read-only agent that did
  not write any of this code, on PR-B's T20 precedent. It was instructed to re-derive every
  criterion from raw data and to inherit no figure from `tasks.md`, `spec.md`, `design.md`, the
  commit messages, or `.specs/reports/`.

## VERDICT: **PASS**

All seven criteria in scope hold on the shipped tree — **GMS-01 AC-1 through AC-6** and
**GMS-02 AC-2**. No surviving mutant. Two residual findings are recorded in §5; neither blocks,
and one of them was resolved by a measurement the verifier did not take.

**Every figure below was re-derived twice** — once by the verifier and once by the main agent —
on the standing rule for this feature that a subagent's mechanism holds more often than its
figures do (eight consecutive critics, each with at least one figure that did not). Where the two
passes disagree, that is stated. **They did not disagree on any figure in this document.**

---

## 1. Criteria

| AC | Verdict | Evidence produced during validation | Proves the work happened, or only that nothing broke? |
| --- | --- | --- | --- |
| **AC-1** — deterministic check reports zero disallowed imports, and runs in CI | **PASS** | `bun scripts/check-core-layering.ts` → `PASS — 0 violation(s) across 965 tier-to-tier edges in 895 tracked files`, exit 0. CI wiring read at `.github/workflows/ci.yml:153`, inside the **`build`** job. `scan()` read directly: no `ALLOWLIST`/`EXEMPT`/`IGNORE` export, no suppression parameter | **Happened** — the edge count is printed on a PASS precisely so a check that resolved nothing cannot read the same as a clean one |
| **AC-2** — `CLAUDE.md` and `src/index.ts` describe the contract the check enforces, no third description anywhere | **PASS**, with a recorded borderline (§5.1) | Both sources read verbatim (`packages/core/src/index.ts:1-23`, `CLAUDE.md:212-232`); they state the identical contract. Independent repo scan for the layer triad found exactly one further hit, `docs/ONBOARDING.md:54-90` | **Happened** — both files previously described the four-layer contract being retired |
| **AC-3** — every backward import removed or allowlisted | **PASS** | All four backward directions measured at population **0**, not exempted. `FORBIDDEN` has 4 rows and no exemption path. `packages/core/src/controllers/` confirmed absent; 0 dynamic `import(".../controllers/...")` hits | **Happened** — closed by removal, which is what keeps the allowlist empty |
| **AC-4** — `data → services` addressed *(amended — C15: referent is 26/16, quote-agnostic)* | **PASS** | Quote-agnostic sweep over `packages/core/src/data` for `from '…/services/…'` → **0 matches, 0 files** | **Happened** — the group was 26 at `450352b` |
| **AC-5** — `services → tools` resolved by relocating `ToolError` | **PASS** | Same quote-agnostic pattern over `services/` → **0**. `ToolError` and `validateEnum` found at `packages/core/src/kernel/enum-validation.ts:36,59`; no `enum-validation` file remains under `tools/` | **Happened** — absence at the old site *and* presence at the new one |
| **AC-6** — `./controllers` subpath removed; `npm pack --dry-run` lists no path without a backing file | **PASS** | `packages/core/package.json` exports = `.`, `./tools`, `./services` only; zero `controllers` hits in the file. **Cache-forced real build** (`--force`, all 5 packages rebuilt), then `npm pack --dry-run`: **1227 files, zero `dist/controllers` entries**; all 3 subpaths resolve to real emitted files | **Happened**, and verified against a *fresh* build rather than a stale `dist/` |
| **GMS-02 AC-2** — a representative handler's behaviour unchanged, proven by tests written **before** the move and passing **unmodified** after | **PASS** | T9 (`84853b0`) added `search-memories-tool.characterization.test.ts` and `search-project-tool.characterization.test.ts`, 638 lines, **0 production files touched**. `git merge-base --is-ancestor 84853b0 ff86625` → true. **SHA-256 of both files at `84853b0` equals SHA-256 at `HEAD`** (`28331079582e54d1`, `93865382d6cce899`) — byte-identical, independently re-hashed by both passes. Both suites run post-move: 13 pass + 14 pass, 0 fail | **Happened** — and this is the only AC that is a claim about **history** rather than about the tree, so ancestry + byte-identity is the evidence, not "the tests are green now" |

### On the amended criteria

Four criteria in scope carry inline `*(amended at PR-C's T16 — Cnn; …)*` notes: **AC-3** (C19),
**AC-4** (C15), and GMS-02 **AC-1**/**AC-2** (C13). The verifier was asked to judge whether each
amendment is legitimate or is a criterion bent to fit the tree, and found none bent. Each replaces
an instrument or a referent while preserving intent, and each states its own rejected alternative
— the convention C1–C12 set at PR-B's T19.

---

## 2. The two readings T18 was required to re-run rather than inherit

**`check-stale-pointers` — full corpus:**

```
137 pointers in tracked files
  RESOLVES   109
  HISTORICAL 28  (pinned at 28)
  BROKEN     0
[stale-pointers] PASS — 0 broken, historical exactly at its pin of 28     exit 0
```

Reproduces C26's narrowing (142 → 137, RESOLVES 114 → 109) with **`HISTORICAL` unchanged at 28** —
the pin being the one figure the narrowing does not touch, and the only figure the gate asserts.

**`search-hub-metric` — G-HUB:**

```
ContextualSearchRLM   maxForeignReach 3   (deepestReader: search-controller.ts)
maxFileLoc            696                 (contextual-search-rlm.ts)
[hub-metric] PASS — every type <= 3 foreign reach, every file <= 700 LOC
```

`MAX_FOREIGN_REACH = 3` confirmed in source. **R-18's "3 against a ceiling of 3, zero margin"
reproduces exactly.** Any later change adding a fourth foreign read of `ContextualSearchRLM` flips
this gate.

---

## 3. Discrimination sensor

Faults injected on the **real tree**, each subject backed up to a scratch copy and restored from
it, with SHA-256 byte-identity asserted after every restore. **Never `git checkout`** — it restores
to `HEAD` rather than to pre-mutation state, and destroyed two files of uncommitted work at T8b.

| # | Gate | Mutation | Expected | Observed | Restore |
| --- | --- | --- | --- | --- | --- |
| 1 | `check-core-layering` | single-quoted `data → services` import | FAIL | **FAIL**, exit 1 | SHA-256 match |
| 2 | `check-core-layering` | `services → tools` import | FAIL | **FAIL**, exit 1 | SHA-256 match |
| 3 | `check-core-layering` | `kernel → services` import | FAIL | **FAIL**, exit 1 | SHA-256 match |
| 4 | `search-hub-metric` | a 4th distinct member read on the hub type | FAIL | **FAIL**, exit 1 | SHA-256 match |
| 5 | `check-stale-pointers` | citation to a file that never existed | FAIL (BROKEN > 0) | **FAIL**, exit 1 | SHA-256 match |

**No surviving mutant.** Mutation 1 is the discriminating one for C15 — a single-quoted violation
is exactly what AC-4's original double-quote-anchored pattern could not see.

T15's own harness had already run six further mutations against `check-core-layering` at authoring
time, including an **inert control** (a legal `tools → data` edge, which must stay PASS while still
being *counted*) and an **attribution control** (the violation present with only its clause removed,
which must go green). Those are the author's; the five above are the verifier's, independently
chosen.

---

## 4. Gate state at validation

| gate | reading |
| --- | --- |
| `lint` (oxlint) | exit 0 |
| `type-check` | 6/6 successful (`--force`, 0 cached) |
| `build` | 5/5 successful (`--force`, 0 cached, `dist/` deleted first) |
| `check-core-layering` | PASS — 0 violations, **965** edges, **895** files |
| `check-stale-pointers` | PASS — **137 / 109 / 28**, 0 broken |
| `check-characterization` | PASS — 3/3 |
| G-HUB | PASS — 23 files, `maxFileLoc` **696**, `maxForeignReach` **3/3** |
| `bun run test` | 11/11 turbo tasks — core **142** groups, tools-api **25**, mcp-client **8**, exit 0 |
| `test:scripts` | **1018** pass / 0 fail across 48 files, exit 0 |
| `npm pack --dry-run` | 1227 files, zero `dist/controllers` |
| gate scripts' own unit suites | 93/93 |

---

## 5. Residual findings — ranked

### 5.1 `docs/ONBOARDING.md` disclaims duplication rather than removing it — **recorded, not a defect**

AC-2 says *"no third description anywhere"*. ONBOARDING's diagram still reproduces the substance —
the tier names, the arrows, "schema + delegation only", "imports no tier" — and T14's fix is a
sentence deferring authority to the two canonical sources plus a note that what follows is the
knowledge graph's inventory. The verifier judged this **PASS** and flagged it as *"a textual
disclaiming of duplication, not removal of it"*.

**That is the correct reading of it, and it is a decision rather than an oversight.** T14 put the
question to the user with the alternatives measured; the chosen option was *"ONBOARDING cites,
never states"*, against **rejected**: replacing the section with a bare pointer (literal compliance,
at the cost of gutting the section a new contributor reads first), and reading "anywhere" as
binding only the two files AC-2 names (least work, leaves the judgement to a later verifier).
Recorded here so a future re-litigation of AC-2 starts from the options, not from the outcome.

### 5.2 `scripts/run-deterministic.ts` exits 1 — **pre-existing, and PR-C improved it**

The verifier found this gate red at `HEAD` (13 fail) and correctly declined to attribute it,
noting the failures pass in isolation and match the documented cross-test-pollution mode. It did
not take the measurement that settles ownership. **That measurement was taken here**, against the
frozen `450352b` worktree — the same tree `main` is at:

```
450352b (main)   494 pass / 125 fail across 128 files   exit 1
HEAD             1796 pass /  13 fail across 129 files  exit 1
```

**Red on both, and substantially less red at `HEAD`.** PR-C did not break this gate; the failure
count fell by 112 and the executed test count more than tripled. It is a real gate-hygiene gap —
it is a core gate, it is not in any task's gate list, and unlike the `mcp-client` flake nobody
tracks it as known-red — but it is **not PR-C's**, and not a blocker.

This is C27's shape caught early rather than late: C27 was a gate outside a task's list that PR-C
*did* turn red, found only by running something nobody asked for. The same instinct applied here
found a gate outside the list that PR-C did not.

### 5.3 A new, undiagnosed `mcp-client` flake

`api-key-config-seeded.test.ts` — *"a whitespace-only stored key is treated as unset"* — failed
once at 1602 ms with `ApiHttpError: … status 501` while `tools-api`'s socket suites ran alongside
it, and passes in isolation (8/8 groups). Observed at T14, whose only `packages/core` edit is a
docblock, so it is not PR-C's. Same family as the `embedded-api-client-endpoints` case `CLAUDE.md`
documents, but a different test and a different symptom. **Owed a diagnosis by its own change.**

### 5.4 C21's class remains uncovered

`check-stale-pointers` inherits `POINTER`'s alphabet and does not widen it, so a moved module whose
name carries no stem is as invisible as before. This is why T14's 22 added path citations were
resolved by hand rather than declared safe by a green gate — the gate reads PASS on them by not
looking. Recorded, not mitigated.

---

## 6. What was NOT verified

Stated plainly, because an unverified claim recorded as verified is the defect class this feature
exists to eliminate.

- The full `bun run test:plugins`, the needles retrieval gate, and the complete E2E suite. Out of
  this task's named AC scope — those are GMS-05 AC-4's, and PR-B owns them.
- The **live** GitHub branch-protection ruleset's `required_status_checks` list. The workflow file
  wires `check-core-layering` into the `build` job, which is what AC-1 requires; whether `build` is
  a merge-blocking check today is a repository setting with no diff anywhere in this tree, and
  `CLAUDE.md` documents that distinction as a real trap. **Worth querying before merge:**
  `gh api repos/luizgmassa/massa-ai/rules/branches/main`.
- C1–C12, and the C13–C27 figures not directly implicated by the seven criteria above — for example
  C17's vector-store-construction count and C22/C23's kernel roster. Those belong to the tasks that
  produced them.
- Whether commits in `450352b..HEAD` outside the ones inspected altered tests in ways the targeted
  isolated runs did not cover. The full `bun run test` aggregate (11/11 tasks, 0 FAIL) is the
  compensating evidence, but it was run by the author, not the verifier.

---

## 7. Outcome

**PR-C is validated.** GMS-01 AC-1–AC-6 and GMS-02 AC-2 all hold, re-derived from raw data by an
independent verifier and re-measured by the main agent. GMS-02's headline and **AC-1** remain
**PR-D's** by C13.

No fix tasks were generated; the fix → re-verify loop was not entered.
