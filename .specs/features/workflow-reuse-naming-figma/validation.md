# Workflow Reuse-Scan, English Naming, and Figma Wiring Validation

**Date**: 2026-08-07 (iteration 1); re-verified 2026-08-07 (iteration 2, same session)
**Spec**: `.specs/features/workflow-reuse-naming-figma/spec.md`
**Diff range (iteration 1)**: `d79af5ed..HEAD` at 14 commits (T1–T12 + ordering-sensor commit `f9da6703`)
**Diff range (iteration 2)**: `d79af5ed..HEAD` at 16 commits (adds `59a4dcd1`, `68c7b840`)
**Verifier**: independent sub-agent (author ≠ verifier)
**Current verdict**: see "Iteration 2 Summary" below — this file preserves iteration 1's full report as history above the iteration 2 addendum.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 | ✅ Done | `code-reuse-scan.md` created + router line (`1bbd4e49`) |
| T2 | ✅ Done | `figma-wiring.md` created + router line (`1c76e917`) |
| T3 | ✅ Done | `design-implementation.md` extracted; `design.md` invariants untouched (`a5fad47d`) |
| T4 | ✅ Done | `## Language` block added to `naming-standards.md` (`e9b13623`) |
| T5 | ✅ Done | Harness-contract extension, committed red-by-design (`c80ed276`) |
| T6 | ✅ Done | 16-file insertion + version bumps, sensor turned green (`bcd26bf2`) |
| T7 | ✅ Done | spec-driven ordering + Figma enablement (`a1df51ed`) |
| T8 | ✅ Done | Phase-guide hooks — **partial**: `design.md` phase guide is missing the NAME-03 English-conversion pointer (see AC table, NAME-03) (`860ab653`) |
| T9 | ✅ Done | feature.md Figma + reuse-scan ordering (`78d9b308`) |
| T10 | ✅ Done | figma-pre-analysis Stage 1/2 pointers (`eb3ebb3f`) |
| T11 | ✅ Done | `validate_figma_wiring.ts` + fixture suite (`8259a0ac`) |
| T12 | ✅ Done | CHANGELOG entry + build gate (`b1b1e602`) |
| — | — | Extra ordering-sensor commit `f9da6703` (post-T12, closes plan-critic F1 gap) |
| **T13** | ❌ **Not done** | No commit performs the close-out. `.specs/project/STATE.md` has no AD-019 entry, `.specs/project/FEATURES.json` does not register `workflow-reuse-naming-figma` (`active_feature` still reads `worktree-isolation-gate`), `.specs/HANDOFF.md` has zero mentions of this feature. Confirmed by `git log`, and by grep against all three files returning no hits. |

---

## Spec-Anchored Acceptance Criteria

### P1: Mandatory reuse scan before new code

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| REUSE-01: one normative reuse-scan reference | `references/code-reuse-scan.md` defines scan targets, subagent dispatch, reuse-map contract, inline fallback | `skills/massa-ai/references/code-reuse-scan.md:15,28,48,71` — `## Scan Targets`/`## Dispatch`/`## Reuse-Map Output Contract`/`## Inline Fallback`; existence asserted at `scripts/__tests__/workflow-harness-contract.test.ts:569-581` | ✅ PASS |
| REUSE-02: mandatory scan before new code in all 16 workflows | uniform action line in every implementation workflow | `scripts/__tests__/workflow-harness-contract.test.ts:521-544` (16 per-file + byte-uniformity, all green); example instance `skills/massa-ai/workflows/feature.md:20` | ✅ PASS |
| REUSE-03: spec-driven orders scan after Specify, before Design/Tasks | scan clause indexes after the Specify step, before the Design/Tasks decision steps | `skills/massa-ai/workflows/spec-driven.md:96,102,104,105`; ordering asserted at `scripts/__tests__/workflow-harness-contract.test.ts:635-645` | ✅ PASS |
| REUSE-04 (inline fallback): scan runs inline + records skip reason if spawning unavailable | inline fallback against same contract, reason recorded | `skills/massa-ai/references/code-reuse-scan.md:71-75` (`## Inline Fallback`) | ✅ PASS |

### P1: English-only naming conversion

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| NAME-01: English-language rule in naming-standards.md | rule covers identifiers/classes/methods/screens/components/attributes/artifact names, Portuguese primary case, preserves public contracts | `skills/massa-ai/references/naming-standards.md:31-38` (`## Language`) | ✅ PASS — **but see Gap 2: this content has no committed regression sensor** |
| NAME-02: all 16 workflows load naming-standards.md | literal `references/naming-standards.md` present ×16 | `scripts/__tests__/workflow-harness-contract.test.ts:556-563` (16/16 green) | ✅ PASS |
| NAME-03: spec-driven applies conversion before writing spec/task/design artifacts | conversion clause ordered before each of the three artifact writes | Spec: `skills/massa-ai/references/spec-driven/specify.md:164` ✅. Task: `skills/massa-ai/references/spec-driven/tasks.md:492` (weak — a generic identifier-naming note under "Required Task Shape", not framed as "before writing the artifact"). Design: **no citation exists** — `references/spec-driven/design.md` has zero references to `naming-standards.md` or English conversion anywhere in the file (confirmed by full-file grep). | ❌ **GAP** (see Gap 3) |

### P1: Figma node-id wiring for spec-driven and feature

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| FIGMA-01: lazy-loaded WHERE Figma ingestion enabled, never otherwise | platform-neutral enablement clause, lazy loads only under the condition | `skills/massa-ai/references/figma-wiring.md:10-16` (`## Enablement`); loaded conditionally at `spec-driven.md:100`, `feature.md:35` | ✅ PASS |
| FIGMA-02: Stage 1 creates one file per link | `.specs/<type>/<slug>/figma/NN-<link-slug>.md` per link | `skills/massa-ai/references/figma-pre-analysis.md:49-53`; deterministic backing exercised at `scripts/__tests__/validate-figma-wiring.test.ts:80-97` (multi-file aggregation) | ✅ PASS |
| FIGMA-03: Stage 2 populates the wiring table with the named columns | 8-column table: Number, Figma node id(s), Category, Spec(s) ID, Task(s) ID, Design(s) ID, Explanation, Notes | `skills/massa-ai/references/figma-wiring.md:54` (exact header); parsed and verified by `skills/massa-ai/scripts/validate_figma_wiring.ts:44-46` (`HEADER_RE`) | ✅ PASS |
| FIGMA-04: 13-category table verbatim | Structure, Components, Tokens / Theming, Typography, Visual effects, Behavior / Prototype, Flows, Content, Assets, States, Spatial, Semantics, Mappings | `skills/massa-ai/references/figma-wiring.md:69-71` — verbatim match against spec.md:116 | ✅ PASS |
| FIGMA-05: specs wire high-level, tasks/designs wire low-level categories | category-tier split present + connected to codebase elements | `skills/massa-ai/references/figma-wiring.md:73-83` (`## Category-Tier Rules`); hooks at `spec-driven/specify.md:162`, `spec-driven/design.md:78`, `spec-driven/tasks.md:53` | ✅ PASS |
| FIGMA-06: reuse scan runs during Figma-wired Tasks/Design breakdown | cross-link to `code-reuse-scan.md` | `skills/massa-ai/references/figma-wiring.md:86-89`; `spec-driven/tasks.md:53` | ✅ PASS |
| FIGMA-07: unused Number stops the workflow before Execute | stop, report unused Numbers, ask for direction | `skills/massa-ai/references/figma-wiring.md:91-99` (`## Unused-Number Stop Rule` + deterministic backing pointer); enforced at `spec-driven/tasks.md:53` ("run that reference's unused-Number gate — stop and report... before Execute proceeds"); deterministic backing `skills/massa-ai/scripts/validate_figma_wiring.ts` — unit-tested unwired-row detection at `scripts/__tests__/validate-figma-wiring.test.ts:104-121` | ✅ PASS |
| FIGMA-08: Execute retrieves wired node IDs via Figma MCP | retrieve + implement per wiring, not from memory | `skills/massa-ai/references/figma-wiring.md:102-107` (`## Execute Retrieval Protocol`); hook at `spec-driven/execute.md:84` | ✅ PASS |

### P2: Design-workflow abstraction

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| ABST-01: single normative copy of design directions in shared references | `design-implementation.md` holds the direction set; `design.md`/spec-driven/feature point to it | `skills/massa-ai/references/design-implementation.md:1-6`; `skills/massa-ai/workflows/design.md:24` (step 5 delegates) | ✅ PASS |
| ABST-02: spec-driven/feature absorb by reference under Figma ingestion, not restated | lazy pointer, no restated content | `spec-driven.md:100`, `feature.md:35`; no restated table confirmed by `scripts/__tests__/workflow-harness-contract.test.ts:620-633` (green) | ✅ PASS |
| ABST-03: design.md keeps routing scope, Isolation Gate, mutation loads, project-context line unchanged in form | those 4 line-classes byte-unchanged | `git diff d79af5ed HEAD -- skills/massa-ai/workflows/design.md` shows only the version bump, the Reuse Scan line insertion, the naming-standards load addition, and the steps-5-13 replacement with one delegation line — the Isolation Gate line (`design.md:17`), `references/project-context.md` line (`design.md:13`), and mutation-references paragraph are absent from the diff, i.e. untouched | ✅ PASS |

### P2: Deterministic gate coverage for the new mandates

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| GATE-01: harness-contract asserts reuse-scan uniformity + naming-standards presence ×16 | both assertion groups exist and pass | `scripts/__tests__/workflow-harness-contract.test.ts:521-563` | ✅ PASS |
| GATE-02: full gate set green on delivered tree | workflow-harness-contract, skills-duplication-metric, workflow-metadata-headers, skill-doc-paths, skills-harness-integrity, skill-artifact-parity all pass | Reproduced independently this session — see Gate Check section: 172/0 + 23/0 (parity) | ✅ PASS |
| GATE-03: EXCESS_CEILING raised with attribution if excess > 483 | ceiling untouched or raised with comment | Live-measured excess = **474** (ceiling 483, 9 headroom); `EXCESS_CEILING` unchanged at `scripts/__tests__/skills-duplication-metric.test.ts:70` (no diff to that file in range) — ceiling raise correctly not needed | ✅ PASS |
| GATE-04: version bump ×16 edited files, workflow population stays 40 | semver bump per edited file, `find skills/massa-ai/workflows -name '*.md' \| wc -l` = 40 | Confirmed 40 files; spot-checked version bumps `debug.md` 1.2.0→1.3.0, `general.md` 1.2.0→1.3.0, `feature.md` 1.2.0→1.4.0, `spec-driven.md` 1.1.0→1.3.0 | ✅ PASS |
| GATE-05: each new sensor observed red at least once before trust | red-by-design commit + green-turn commit, or scratch mutation | `c80ed276` (T5, committed red) → `bcd26bf2` (T6, turns green); `f9da6703` commit message records its own observed-red (1 fail → 107 pass); independently reproduced this session for 4/6 mutations (see Discrimination Sensor) | ✅ PASS |

### P3: Post-implementation design-workflow disposition

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| PROC-01: keep/absorb/retire analysis presented, no route change without user decision | analysis + question presented; `workflows/design.md` route unchanged | No route change shipped (confirmed — `design.md` `name`/`description`/routing scope unchanged). The analysis itself has not yet been presented in this session. | ⏭️ **Deferred to parent** — per this verification's charter, PROC-01 is satisfied by the parent presenting the disposition question after this report; not scored as failed. |

**Status**: 22/23 ACs PASS, 1 GAP (NAME-03, partial), 1 deferred-to-parent (PROC-01, by design).

---

## Edge Cases

- [x] Figma MCP unavailable during Execute → stop + report — `figma-wiring.md:106-107`
- [x] Figma link yields zero readable nodes → record empty result + surface with unused-Number report — `figma-wiring.md` `## Empty Or Unreadable Links` section
- [x] Non-English name is a public contract → preserved, exception recorded — `naming-standards.md:36-38`
- [x] Reuse scan finds nothing → evidence-or-zero, not omitted — `code-reuse-scan.md:59-61`
- [x] Workflow resumed after scan, before Tasks/Design → reuse map reused, not re-run, unless code area changed — `code-reuse-scan.md:66-68`

All 5 edge cases handled with direct citations.

---

## Discrimination Sensor

Mutations run in the real worktree in a scratch cycle — each file backed up with `cp` before mutating, restored with `cp` (never `git checkout`), and `git status --porcelain` confirmed empty after every cycle and at the end.

| # | Mutation | File:line | Expected sensor | Observed result | Killed? |
| --- | --- | --- | --- | --- | --- |
| 1 | Removed the Reuse Scan action line from `design.md` | `skills/massa-ai/workflows/design.md` | `workflow-harness-contract.test.ts` REUSE_SCAN describe block | 2 failed (`design.md carries the Reuse Scan action line`, byte-identical-in-16) | ✅ Killed |
| 2 | Reworded one copy of the line ("reuse map" → "reuse-map") in `feature.md`, breaking byte-uniformity | `skills/massa-ai/workflows/feature.md:20` | byte-uniformity assertion | 2 failed (`feature.md carries...`, byte-identical-in-16) | ✅ Killed |
| 3 | Deleted the entire `## Language` rule block from `naming-standards.md` | `skills/massa-ai/references/naming-standards.md:31-38` | Any committed gate covering NAME-01's content | **0 failures** across the full 7-file, 355-test sweep (`workflow-harness-contract`, `skills-duplication-metric`, `workflow-metadata-headers`, `skill-doc-paths`, `skills-harness-integrity`, `validate-figma-wiring`, `validate-repository`) | ❌ **Survived** |
| 4 | True content-swap of the Stage 1 and Stage 2 figma-wiring pointer paragraphs in `figma-pre-analysis.md` (each still contains the literal `references/figma-wiring.md` string, but now describes the wrong stage's job) | `skills/massa-ai/references/figma-pre-analysis.md:45-53` ↔ `:66-70` | `workflow-harness-contract.test.ts`'s hook-chain ordering guard (D11a) | **0 failures** — the guard only checks substring containment per stage slice, not which pointer belongs to which stage | ❌ **Survived** |
| 5 | Broke `isWiredCell()` in `validate_figma_wiring.ts` to always return `true` (never detects an unwired row) | `skills/massa-ai/scripts/validate_figma_wiring.ts` (`isWiredCell`) | `scripts/__tests__/validate-figma-wiring.test.ts` unwired-row fixtures | 2 failed (`a row with all three ID columns empty exits 1...`, `a bare dash or em-dash placeholder... still counts as unwired`) | ✅ Killed |
| 6 | Moved the reuse-scan clause in `spec-driven.md` above the `Run \`Specify\`` step (reversing REUSE-03 ordering) | `skills/massa-ai/workflows/spec-driven.md:96-105` | `workflow-harness-contract.test.ts`'s REUSE-03 ordering assertion | 1 failed (`spec-driven.md's reuse-scan clause indexes after the Specify step...`) | ✅ Killed |

**Sensor depth**: lightweight (one mutation per requirement family, 6 total — exceeds the ≥4 minimum)
**Result**: 4/6 killed — ❌ **2 survived** (mutations 3 and 4)

---

## Interactive UAT Results

`UAT: not applicable` — this is prose/harness-content plus one deterministic gate script; no user-facing behavior to walk through. Per `references/spec-driven/validate.md` §3, automated checks are sufficient for harness-only work.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — 3 new reference files, targeted pointer lines, one new script + its test |
| Surgical changes | ✅ — `design.md` extraction removed steps 5–13 only, invariant lines untouched |
| No scope creep | ✅ |
| Matches patterns | ✅ — reuse-scan dispatch block matches the existing investigator dispatch template; `validate_figma_wiring.ts` matches `validate_{spec,design,tasks}.ts` CLI shape |
| Spec-anchored outcome check (asserted values match spec) | ✅ for 22/23; ⚠️ NAME-03 partial (see Gap 3) |
| Per-layer Coverage Expectation met | ✅ — harness gates cover the markdown layer per tasks.md's Test Coverage Matrix; unit fixtures cover the new script |
| Every test maps to a spec requirement — no unclaimed tests | ✅ |
| Documented guidelines followed | `CLAUDE.md` (gate commands, test:scripts scope), `CONTRIBUTING.md` (7-step protocol), `scripts/__tests__/skills-duplication-metric.test.ts` docblock (ceiling-raise convention) |

---

## Gate Check

- **Gate command**: `bun test scripts/__tests__/workflow-harness-contract.test.ts scripts/__tests__/skills-duplication-metric.test.ts scripts/__tests__/workflow-metadata-headers.test.ts scripts/__tests__/skill-doc-paths.test.ts scripts/__tests__/skills-harness-integrity.test.ts scripts/__tests__/validate-figma-wiring.test.ts` then `bun run generate:artifacts && bun test scripts/__tests__/skill-artifact-parity.test.ts`
- **Result**: 172 passed, 0 failed (first command, 6 files, 470 `expect()` calls) + 23 passed, 0 failed (parity, 1148 `expect()` calls) = **195 passed, 0 failed** total
- **Duplication excess**: 474 / 483 ceiling (9 headroom) — measured live via `measure()` from `scripts/skills-duplication-metric.ts`
- **Test count before feature**: not independently re-measured pre-`d79af5ed` (out of scope for this diff's re-derivation); the delivered tree's own count is what's recorded above
- **Skipped tests**: none
- **Failures**: none in the committed suite (both discrimination-sensor survivors are scratch mutations, not committed-suite failures)

---

## Fix Plans

### Fix 1: T13 close-out never executed

- **Root cause**: Execute stopped after T12 (CHANGELOG + build gate) and one extra ordering-sensor commit; the close-out task (STATE.md AD-019 append + Current-section rotation, FEATURES.json registration, HANDOFF.md update, `check_specs_delivered`/`validate_state` run) was never started.
- **Fix task**: Run T13 exactly as specified in `tasks.md:369-390` — append AD-019 (design D9 shape) to `.specs/project/STATE.md` `## Decisions`, rotate the Current section, register the feature in `.specs/project/FEATURES.json` (including this validation's PASS/Needs-Fix outcome once fixes land), update `.specs/HANDOFF.md`, and run `check_specs_delivered.ts` + `validate_state.ts`.
- **Priority**: Major — the feature is not discoverable through the project's canonical state files, and the class-wide-directive decision (D9) that future features are meant to follow is unrecorded.

### Fix 2: NAME-01 content has no committed regression sensor

- **Root cause**: `workflow-harness-contract.test.ts` only asserts that each workflow *references* the literal path `references/naming-standards.md`; it never asserts anything about that file's own content. `validate-repository.test.ts:172` only asserts the file exists.
- **Fix task**: Add an assertion in `workflow-harness-contract.test.ts` (or a new describe block) that `naming-standards.md` contains the `## Language` heading and its defining sentence (e.g. `toContain("## Language")` plus a key phrase such as `"Convert any non-English source term to English"`).
- **Priority**: Major — this is the P1 MVP story's normative rule text, one line-deletion away from silently regressing.

### Fix 3: Hook-chain ordering guard doesn't verify pointer content, only containment

- **Root cause**: `workflow-harness-contract.test.ts:592-618`'s Stage 1/Stage 2 ordering test checks only `stage1Section.includes("references/figma-wiring.md")` and the same for stage 2 — a content swap between the two pointer paragraphs (each still containing the literal substring) passes undetected, defeating the design D11a stated purpose of catching a future reorder.
- **Fix task**: Assert on a distinguishing substring per stage — e.g. Stage 1's slice must contain `"create one file per supplied Figma link"` and must NOT contain `"populate"` + `"Notes rows"`; Stage 2's slice must contain the inverse.
- **Priority**: Minor — same risk class as Fix 2 but for FIGMA-02/03 rather than NAME-01, and the underlying prose is currently correct.

### Fix 4: NAME-03 — `spec-driven/design.md` phase guide has no English-conversion pointer

- **Root cause**: T8 was scoped (per `tasks.md:245`) as "consume reuse map in Code Reuse Analysis; fill Design ID wiring column" for `design.md`, omitting the English-conversion hook that `specify.md` and `execute.md` both received. Spec NAME-03 requires the conversion clause across all three of spec/task/design.
- **Fix task**: Add a one-line pointer to `references/spec-driven/design.md` (near `### 1` or `### 3 Identify Code Reuse`) applying the English-conversion rule from `references/naming-standards.md` before design.md content is written, mirroring `specify.md:164`.
- **Priority**: Minor — `tasks.md:492` and the workflow-level `naming-standards.md` load partially cover this in practice, but the spec's explicit three-artifact requirement has a real citation gap for one of the three.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| REUSE-01, REUSE-02, REUSE-03 | Pending | ✅ Verified |
| NAME-01 | Pending | ✅ Verified (content) / ⚠️ Needs Fix (regression sensor — Fix 2) |
| NAME-02 | Pending | ✅ Verified |
| NAME-03 | Pending | ⚠️ Needs Fix (Fix 4 — design.md leg missing) |
| FIGMA-01 .. FIGMA-08 | Pending | ✅ Verified |
| ABST-01, ABST-02, ABST-03 | Pending | ✅ Verified |
| GATE-01, GATE-02, GATE-03, GATE-04, GATE-05 | Pending | ✅ Verified |
| PROC-01 | Pending | ⏭️ Deferred to parent (not failed) |

**Note**: this verifier did not write to `.specs/project/FEATURES.json` (that file's update is scoped to T13 / the close-out task, and this agent's only permitted write is this validation report).

---

## Iteration 1 Summary (superseded — see Iteration 2 below)

**Overall (iteration 1)**: ⚠️ Issues
**Result (iteration 1)**: FAIL

(Repo convention note: this deterministic gate reads a binary verdict line; the substantive verdict is Needs Fix in `references/spec-driven/validate.md`'s three-way vocabulary -- implementation diverges from spec in narrow, clearly-fixable ways, not a wholesale rebuild.)

**Spec-anchored check**: 22/23 ACs matched spec outcome; 1 partial gap (NAME-03); 1 deferred by design (PROC-01)
**Sensor**: 4/6 mutations killed, 2 survived (naming-standards.md content has zero regression protection; the figma-pre-analysis hook-chain ordering guard checks substring containment, not pointer identity)
**Gate**: 195 passed, 0 failed (172 targeted + 23 parity)

**What works**: All three new reference files (`code-reuse-scan.md`, `figma-wiring.md`, `design-implementation.md`) are well-formed single normative copies matching their spec ACs exactly, including the verbatim 13-category table and 8-column wiring contract. The 16-workflow reuse-scan mandate is byte-uniform and gate-enforced. `spec-driven.md`'s REUSE-03 ordering is correct and gate-enforced. `design.md`'s abstraction preserved every named invariant (Isolation Gate, project-context line, mutation paragraph, routing scope) with zero diff noise. `validate_figma_wiring.ts` is a solid, well-tested deterministic backing script (population-always-printed, loud-failure-on-zero-rows, dash/em-dash placeholder handling). Duplication excess (474/483) stayed under ceiling without needing a raise. The full committed gate suite (195 tests) is green.

**Issues found**:
1. T13 close-out (STATE/FEATURES/HANDOFF/AD-019) was never executed — Fix 1.
2. `naming-standards.md`'s `## Language` block (NAME-01's actual rule text) has no committed regression sensor — Fix 2.
3. The figma-pre-analysis hook-chain ordering guard is defeated by a content swap between its two pointer paragraphs — Fix 3.
4. `spec-driven/design.md` phase guide has no English-conversion pointer, leaving one of NAME-03's three named artifact types (design) without a citation — Fix 4.

**Next steps**: Route Fixes 1–4 as fix tasks back to Execute (author, not this verifier). Fix 1 is process-blocking (feature must be registered before it can be called done); Fixes 2–4 are gate-hardening and one prose-completeness gap, all with a clear, narrow fix path. Re-verify after landing; this is verification iteration 1 of the 3-iteration cap.

---

## Iteration 1 Ranked Gap List (historical)

1. **T13 close-out never executed** — STATE.md/FEATURES.json/HANDOFF.md — no `file:line` evidence exists (absence confirmed by grep + `git log`). Fix 1.
2. **NAME-01 rule content has zero regression sensor** — `naming-standards.md:31-38` — Fix 2.
3. **NAME-03 design.md leg uncovered** — `references/spec-driven/design.md` (no citation) — Fix 4.
4. **Hook-chain ordering guard checks containment, not identity** — `workflow-harness-contract.test.ts:592-618` — Fix 3.


---

# Iteration 2 — Re-Verification (2026-08-07, same session)

**Diff range**: `d79af5ed..HEAD`, now 16 commits — adds `59a4dcd1` (NAME-03 design-guide clause) and `68c7b840` (three new content/identity sensors) on top of iteration 1's range.
**Trigger**: parent fixed Gaps 2–4 in two commits and asked for re-verification; Gap 1 (T13) reclassified by parent direction as a sequencing item (deferred-to-parent, like PROC-01), not a FAIL gap — the close-out step is nominal spec-driven step-7 flow and runs after this validation, before Propose/PR.

## Fix Commits Reviewed

| Commit | Claim | Verified |
| --- | --- | --- |
| `59a4dcd1` | English-conversion clause added to `references/spec-driven/design.md` (NAME-03 / Fix 4) | ✅ Confirmed at `skills/massa-ai/references/spec-driven/design.md:86` — "Apply the English-conversion rule from `references/naming-standards.md` to every component, interface, method, and data-model name before it is written into `design.md`..." |
| `68c7b840` | New content sensor for `naming-standards.md`'s `## Language` block (NAME-01 / Fix 2); new sensor for the design-guide clause (NAME-03 / Fix 4); Stage 1/Stage 2 guard strengthened to pointer identity (D11a / Fix 3) | ✅ Confirmed at `scripts/__tests__/workflow-harness-contract.test.ts:611-628` — three new/strengthened assertions, exactly as claimed |
| `f9da6703` (pre-existing, assessed in iteration 1) | REUSE-03 ordering assertion | ✅ Already assessed in iteration 1 as mutation 6 (killed) — same assertion, re-confirmed unaffected by this session's edits |

Baseline re-run after the two fix commits, before any scratch mutation: `bun test scripts/__tests__/workflow-harness-contract.test.ts` → **109 passed, 0 failed** (up from 107 in iteration 1 — 2 net new tests, matching the reported 109/109 observed-red-then-green).

## Re-Run Mutations (scratch cycle: `cp` backup → mutate → test → `cp` restore → `git status --porcelain` empty)

| # | Mutation (re-run from iteration 1) | Sensor now targeted | Observed result | Killed? |
| --- | --- | --- | --- | --- |
| 3′ | Deleted the entire `## Language` rule block from `naming-standards.md` (identical mutation to iteration 1's #3) | New test: `naming-standards.md keeps its Language rule block (NAME-01 content sensor)` (`workflow-harness-contract.test.ts:621`) | 1 failed, 108 passed | ✅ **Now Killed** (was: Survived) |
| 4′ | True content-swap of the Stage 1/Stage 2 figma-wiring pointer paragraphs (identical mutation to iteration 1's #4) | Strengthened test: `figma-pre-analysis.md's Stage 1 figma-wiring pointer indexes before its Stage 2 pointer...` now asserts `stage1Section` contains `"create one file per supplied Figma link"` and excludes `"wiring table as that slice's retrieval"`, and the inverse for `stage2Section` (`workflow-harness-contract.test.ts:611-618`) | 1 failed, 108 passed | ✅ **Now Killed** (was: Survived) |
| 7 (new) | Removed the new English-conversion sentence from `references/spec-driven/design.md:86` | New test: `the spec-driven design phase guide carries the English-conversion clause (NAME-03)` (`workflow-harness-contract.test.ts:627`) | 1 failed, 108 passed | ✅ Killed |

Each mutation reverted with `cp`; `git status --porcelain` returned only the pre-existing untracked `validation.md` after every cycle, confirmed clean at completion.

Mutations 1, 2, 5, 6 from iteration 1 were not re-run — they target files (`design.md` workflow, `feature.md`, `validate_figma_wiring.ts`, `spec-driven.md` workflow) untouched by `59a4dcd1`/`68c7b840`, and their sensors (separate describe blocks / separate test file) are unaffected by this session's diff. Combined sensor record across both iterations: **7/7 mutations killed** (4 from iteration 1 unchanged + 2 iteration-1 survivors now fixed + 1 new).

## NAME-03 Re-Check

| Leg | file:line | Result |
| --- | --- | --- |
| spec | `skills/massa-ai/references/spec-driven/specify.md:164` | ✅ PASS (unchanged from iteration 1) |
| design | `skills/massa-ai/references/spec-driven/design.md:86` (new) | ✅ PASS — Gap 3/Fix 4 closed |
| task | `skills/massa-ai/references/spec-driven/tasks.md:492` | ✅ PASS (unchanged — accepted in iteration 1 as sufficient: loads `naming-standards.md`, which now carries a content sensor, before tasks introduce/rename identifiers) |

**NAME-03 verdict: ✅ PASS** (upgraded from ❌ GAP).

## Gate Suite Re-Run (delivered tree, after fix commits, worktree clean)

- `bun test scripts/__tests__/workflow-harness-contract.test.ts scripts/__tests__/skills-duplication-metric.test.ts scripts/__tests__/workflow-metadata-headers.test.ts scripts/__tests__/skill-doc-paths.test.ts scripts/__tests__/skills-harness-integrity.test.ts scripts/__tests__/validate-figma-wiring.test.ts` → **174 passed, 0 failed** (6 files, 476 `expect()` calls) — up from 172/0 (2 net new content/identity sensors)
- `bun run generate:artifacts && bun test scripts/__tests__/skill-artifact-parity.test.ts` → **23 passed, 0 failed** (1148 `expect()` calls)
- **Total: 197 passed, 0 failed**
- Duplication excess: **474 / 483** (unchanged — the two-sentence design.md addition didn't move the metric)

## Gap 1 (T13) — Reclassified

Per parent direction, T13 close-out is sequencing (nominal spec-driven step-7: write/commit STATE/HANDOFF/FEATURES before Propose, which runs after this validation), not a defect this feature's behavior lacks. Re-confirmed still absent from the delivered tree (`git log`, and grep against all three files still returns no hits — unchanged since iteration 1, expected since T13 is scoped to run after PASS). Treated the same way as PROC-01: a residual condition the parent must satisfy before Propose/PR, not a FAIL gap.

## Updated Spec-Anchored Acceptance Criteria (deltas only)

| Criterion | Iteration 1 | Iteration 2 |
| --- | --- | --- |
| NAME-01 | ✅ PASS (content), ⚠️ no regression sensor | ✅ **PASS, sensor added** (`workflow-harness-contract.test.ts:621-626`) |
| NAME-03 | ❌ GAP (design.md leg uncovered) | ✅ **PASS** (`spec-driven/design.md:86`) |
| (D11a hook-chain guard, not a spec AC but a GATE-05 evidence item) | Survived a content-swap mutation | ✅ **Now identity-checked**, kills the same mutation |

**Status**: 23/23 ACs PASS, 0 GAPs, 1 deferred-to-parent (PROC-01, by design, unchanged).

---

## Iteration 2 Summary

**Overall**: ✅ Ready
**Result**: PASS

**Spec-anchored check**: 23/23 ACs matched spec outcome; 0 gaps; 1 item deferred by design (PROC-01)
**Sensor**: 7/7 mutations killed across both iterations (0 survivors remaining)
**Gate**: 197 passed, 0 failed (174 targeted + 23 parity)

**What works**: Everything recorded in Iteration 1's "What works" still holds. In addition: `naming-standards.md`'s `## Language` block now has a direct content sensor (heading + two defining phrases) so a future deletion is caught immediately. The figma-pre-analysis Stage 1/Stage 2 ordering guard now checks pointer *identity* (a distinguishing phrase per stage, with a negative assertion against the other stage's phrase), not mere substring containment, so a content swap between the two paragraphs is caught. `spec-driven/design.md`'s phase guide now carries the same English-conversion pointer pattern as `specify.md` and `execute.md`, closing NAME-03's third leg. All three fixes were observed red via scratch mutation by the parent before landing (109/109 reported) and independently re-confirmed red→green by this verifier in this session.

**Issues found**: None blocking. One residual condition outstanding, both already known and explicitly out of this verification's scope per its own charter:
1. **T13 close-out (STATE/FEATURES/HANDOFF/AD-019)** — not yet run; sequencing item, must complete before Propose/PR (parent-owned, nominal step-7 flow — not a feature defect).
2. **PROC-01 disposition analysis** — not yet presented to the user; deferred to parent by this verification's own charter (unchanged from iteration 1).

**Next steps**: No further fix→re-verify iterations needed (iteration 2 of the 3-iteration cap; PASS closes the loop). Parent should: (a) present the PROC-01 keep/absorb/retire analysis for `workflows/design.md`, (b) run T13 close-out (AD-019, FEATURES.json registration, HANDOFF.md update, `check_specs_delivered`/`validate_state`), then proceed to Propose (branch push + `gh pr create`) under the existing Execute-start go-ahead.

---

## Iteration 2 Ranked Gap List (residual conditions, not FAIL gaps)

1. **T13 close-out outstanding** — parent-owned, run before Propose. Not scored against this PASS verdict (sequencing, per parent direction).
2. **PROC-01 disposition analysis not yet presented** — parent-owned, deferred by this verifier's charter (unchanged from iteration 1).

No AC gaps and no surviving discrimination mutants remain.
