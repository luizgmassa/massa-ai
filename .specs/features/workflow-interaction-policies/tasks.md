# Workflow Interaction Policies — Tasks

- **Slug**: `workflow-interaction-policies` · session `spec-workflow-interaction-policies`
- **Sizing**: 4 Phases = 9 Tasks (phases sized to the new rule: max 3 tasks each)
- All paths relative to the worktree root
  `/Users/luizmassa/Projects/massa-ai-wt-workflow-interaction-policies`.

## Execution Plan

Sequential phases, one atomic commit per task. Phase 1 fixes the canonical packing model
and its Tasks-side rules; Phase 2 updates the Execute-side and workflow-file mirrors
(depends on Phase 1's final wording); Phase 3 lands the summary stage and the spec-driven
question-policy edits; Phase 4 lands the remaining question edits, the validator
phase-size enforcement (T9), then CHANGELOG + artifact regeneration + close-out (T8
always last).

Setup (not a task): `bun install` in the worktree before the first gate; environment
failures reported as environment, not code.

## Task Breakdown

### Phase 1 — canonical packing model

### T1: Rewrite sub-agents.md packing model to max 3 / ideal 2

**Where**: skills/massa-ai/references/spec-driven/sub-agents.md
**Depends on**: none
Rewrite the **whole Phase-Batch Workers packing block (lines 14–45)**, not a line list:
trigger (14), batching algorithm heading + body + formula (16–26), worked examples
(28–30, recomputed for budget 3), **coarse-phase caveat (31–32) deleted** — superseded by
the hard ≤3 rule; no `~1.5×` / `~10+ tasks` / tight-chain exception survives (D12) —
offer script (36), diagram (43–45), orchestration flow step (111): budget max 3
tasks/worker ideal 2, whole phases only, `>3-task feature always ≥2 workers` replaces
every single-batch clause, `ceil(T / 7)` and "benchmarked sweet spot ~7 (~20 → 3
workers)" replaced per D2/D5. The recomputed worked examples MUST NOT retain the
dangling "phases too coarse to hit 3 — see below" pointer (its "below" target, the
caveat, is deleted). Keep the ~40k context-sizing signal.
**Tests**: grep sensors — old literals absent, new budget text present (see Matrix)
**Gate**: `rtk proxy grep -n "7 task\|7-task\|ceil(T / 7)\|sweet spot\|4–8\|4-8\|1.5×\|10+ tasks\|tight dependency chain" skills/massa-ai/references/spec-driven/sub-agents.md` returns nothing; new-text greps hit

### T2: tasks.md phase-granularity rule + packing mirrors

**Where**: skills/massa-ai/references/spec-driven/tasks.md
**Depends on**: T1
Rewrite the **whole phase-sizing block (lines 149–154 — line 156's "No trailing wiring
phase" rule is OUT of scope and must survive verbatim)**: size phases to max 3 tasks,
ideal 2; a larger phase is wrongly sized — split it at a genuine dependency/cohesion
seam; **both budget bullets deleted** (the `~10 tasks (≈1.5× the budget)` split threshold
and the "tight dependency chain … legitimate (if fat) single-worker phase" exception —
D12, no carve-out survives). Also line 357 (packing paragraph: new budget, no
single-batch clause, trigger unchanged) and line 362 (step: pack into max-3-task
batches). Wording mirrors T1's canonical text.
**Tests**: grep sensors on tasks.md (old absent / new present)
**Gate**: `rtk proxy grep -n "7 task\|7-task\|4–8\|4-8\|sweet spot\|1.5×\|10 tasks\|tight dependency chain" skills/massa-ai/references/spec-driven/tasks.md` returns nothing

### Phase 2 — Execute-side and workflow mirrors

### T3: execute.md budget mirrors, over-sized-phase valve, summary hook

**Where**: skills/massa-ai/references/spec-driven/execute.md
**Depends on**: T2
Update lines 14/34/38 to the new budget and dead-clause replacement; add the over-sized
phase safety valve (>3-task phase at packing → stop, split during Tasks); extend the
mandatory pre-Execute offer paragraph (38) so the offer message begins with the
pre-implementation change summary per implementation-delivery.md Stage 1.5, organized by
tasks from tasks.md (WF-04, WF-11).
**Tests**: grep sensors — old budget absent; `Stage 1.5` / summary hook present
**Gate**: `rtk proxy grep -n "7 task\|7-task\|4–8\|4-8" skills/massa-ai/references/spec-driven/execute.md` returns nothing; summary-hook grep hits

### T4: workflows/spec-driven.md mirrors + summary mention + version bump

**Where**: skills/massa-ai/workflows/spec-driven.md
**Depends on**: T3
Update lines 53 and 111 (new budget, dead clause replaced), add the change-summary
mention to the Execute step (step 6 area), bump `metadata.version` 1.3.0 → 1.4.0.
**Tests**: grep sensors; version literal check
**Gate**: `rtk proxy grep -n "7-Task\|4–8\|4-8" skills/massa-ai/workflows/spec-driven.md` returns nothing; `grep -n 'version: "1.4.0"'` hits

### Phase 3 — summary stage + spec-driven question policy

### T5: implementation-delivery.md Stage 1.5 — Summarize

**Where**: skills/massa-ai/references/implementation-delivery.md
**Depends on**: none
Add chain-table row `1.5 | Summarize` between Isolate and Implement, and section
`### Stage 1.5 — summarize before you touch the tree`: task-separated list contract
(`- T01` + `--` sub-items, medium-length phrases, clear/direct/objective), source =
approved spec/design/tasks artifacts else plan/conversation work items, **self-sufficient
anchor** (D13): the summary is presented with the Stage 3 delivery-authorization ask
defined in this same reference, so no per-workflow anchor is required; not a new
standalone gate; applies to Quick mode; includes the operator's example block (WF-10).
**Audit step (WF-15)**: read the step sequences of debug.md, design.md, maestro.md,
maestro-fix.md, tests-fix.md, implementation-fix.md; confirm no text contradicts a
pre-first-mutation pause; add a one-line anchor only where a contradiction is found, and
record the audit verdict per workflow in the commit message body. The final
verification-agent spot-checks the six recorded verdicts against the named files rather
than trusting "audit done" (critic watch-item).
**Tests**: grep sensors — `Stage 1.5`, `- T01`, example sub-item shape present
**Gate**: `rtk proxy grep -n "Stage 1.5\|T01" skills/massa-ai/references/implementation-delivery.md` hits both; audit verdict recorded

### T6: discuss.md + specify.md question policy

**Where**: skills/massa-ai/references/spec-driven/discuss.md, skills/massa-ai/references/spec-driven/specify.md
**Depends on**: none
discuss.md line 199: remove `≤2 independent questions per turn`; new text = no numeric
cap, ask as many as needed, dependency-ordered pacing kept, ask-first for important or
uncertain decisions, trivial safe details may be assumed and recorded (WF-05).
specify.md §1: add no-question-limit + important-decisions-are-asked note (WF-07);
§4 item 4: assumption-without-asking restricted to trivial/safe or explicitly
user-deferred (WF-08).
**Tests**: grep sensors — cap literal absent; new stance literals present in both files
**Gate**: `rtk proxy grep -rn "≤2 independent" skills/` returns nothing

### Phase 4 — remaining question edits + delivery

### T7: tdd + workflows/design.md question policy

**Where**: skills/massa-ai/references/tdd/discovery-and-sizing.md, skills/massa-ai/workflows/tdd.md, skills/massa-ai/workflows/design.md
**Depends on**: none
tdd discovery Clarification Policy: remove `Group at most three related questions per
turn`; new text = group related questions naturally, no numeric cap, ask when in doubt on
important decisions (WF-06). **workflows/tdd.md line 35** (critique find): remove `Ask at
most three related questions at a time` with the same no-cap rewrite; bump tdd.md
`metadata.version` 1.1.0 → 1.2.0. workflows/design.md step 4: `Ask only when` → ask
whenever doubt remains after source inspection (WF-09); bump its `metadata.version`
1.3.0 → 1.4.0.
**Tests**: grep sensors — `at most three` absent from skills/; new literals present
**Gate**: `rtk proxy grep -rn "at most three" skills/massa-ai/workflows/ skills/massa-ai/references/tdd/` returns nothing

### T9: validate_tasks.ts phase-size enforcement

**Where**: skills/massa-ai/scripts/validate_tasks.ts, scripts/__tests__/spec-driven-validators.test.ts
**Depends on**: none
Add a per-phase task-count check: any phase in the Task Breakdown holding more than 3
tasks reports an **error** (WF-16, D14). Extend `spec-driven-validators.test.ts` with an
observed-red case (4-task-phase fixture → exit 1 with the new error) and a green case
(≤3-task phases pass). Inspect `scripts/__tests__/fixtures/pyts-golden/validate_tasks.json`
fixtures' phase sizes; re-record only entries the new check legitimately fires on and
name each in the PR description.
**Tests**: new red+green cases in spec-driven-validators.test.ts; pyts-golden suite green
**Gate**: `bun test scripts/__tests__/spec-driven-validators.test.ts` and `bun test scripts/__tests__/pyts-golden.test.ts` pass, with the red case observed failing before the fix is complete

### T8: CHANGELOG, artifact regeneration, parity gates, close-out

**Where**: CHANGELOG.md, .specs/project/STATE.md, .specs/HANDOFF.md, .specs/project/FEATURES.json
**Depends on**: T1, T2, T3, T4, T5, T6, T7, T9
Add `[Unreleased]` → `### Changed` entry (WF-14). Run `bun run generate:artifacts` and
`--check`; run subagent-parity, skill-artifact-parity, skills-harness-integrity suites
(WF-13). Run the full repo-wide grep sweep (Success Criteria, including the caveat
literals `1.5×` / `10+ tasks` / `tight dependency chain`). Update STATE.md, HANDOFF.md,
FEATURES.json (register feature, close Execute) before push per Stage 3.5.
**Tests**: parity suites + generator check + repo-wide grep sweep + `check_specs_delivered.ts`
**Gate**: `bun run generate:artifacts --check` exit 0; three suites pass; `bun skills/massa-ai/scripts/check_specs_delivered.ts workflow-interaction-policies --root .` exit 0

## Test Coverage Matrix

| AC (spec) | Sensor | Task |
| --- | --- | --- |
| WF-01 budget at all sites | Repo-wide `rtk proxy grep -rn "7 task\|7-task\|7-Task\|ceil(T / 7)" skills/` = 0 hits; `rtk proxy grep -rln "max 3 tasks\|ideal 2" skills/massa-ai/references/spec-driven/ skills/massa-ai/workflows/spec-driven.md` covers 4 files | T1–T4, swept in T8 |
| WF-02 phase granularity | grep tasks.md for the ≤3/ideal-2 phase-sizing rule | T2 |
| WF-03 derived prose | grep `4–8\|4-8\|20 tasks → 3\|sweet spot` over `skills/` = 0 hits (packing contexts) | T1–T4, swept in T8 |
| WF-04 over-sized phase valve | grep execute.md for the split-during-Tasks valve text | T3 |
| WF-05 discuss cap removed | grep `≤2 independent` over `skills/` = 0; ask-first literal present | T6 |
| WF-06 tdd caps removed (both files) | grep `at most three` over `skills/massa-ai/workflows/` + `references/tdd/` = 0 | T7 |
| WF-07 specify no-limit | grep specify.md for no-limit note | T6 |
| WF-08 closure-gate qualifier | grep specify.md §4 for trivial/deferred qualifier | T6 |
| WF-09 design.md rephrase | grep `Ask only when` absent from workflows/design.md step 4 | T7 |
| WF-10 summary stage | grep implementation-delivery.md for `1.5` row + `T01` example | T5 |
| WF-11 execute hook | grep execute.md for summary-with-offer hook | T3 |
| WF-12 spec-driven mirrors + version | greps + `version: "1.4.0"` | T4 |
| WF-13 parity | `generate:artifacts --check` + 3 suites | T8 |
| WF-14 changelog | `[Unreleased]` section diff contains the entry | T8 |
| WF-15 caveat deleted + pause audit | caveat-literal greps = 0 (T1/T2 gates + T8 sweep); six-workflow audit verdict recorded in T5's commit body | T1, T2, T5, T8 |
| WF-16 validator enforcement | observed-red 4-task-phase case + green run on this tasks.md; pyts-golden green after deliberate re-records | T9 |

## Gate Check Commands

```bash
# per-task sensors: see each task's Gate line (all evidence greps via rtk proxy)
bun install                                              # worktree provisioning (setup)
bun run generate:artifacts                               # regenerate bundles
bun run generate:artifacts --check                       # drift check, exit 0
bun test scripts/__tests__/subagent-parity.test.ts
bun test scripts/__tests__/skill-artifact-parity.test.ts
bun test scripts/__tests__/skills-harness-integrity.test.ts
bun test scripts/__tests__/spec-driven-validators.test.ts
bun test scripts/__tests__/pyts-golden.test.ts
bun skills/massa-ai/scripts/validate_spec.ts workflow-interaction-policies --root .
bun skills/massa-ai/scripts/validate_design.ts workflow-interaction-policies --root .
bun skills/massa-ai/scripts/validate_tasks.ts workflow-interaction-policies --root .
bun skills/massa-ai/scripts/check_specs_delivered.ts workflow-interaction-policies --root .
```
