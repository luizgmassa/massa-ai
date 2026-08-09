# Workflow Interaction Policies Specification

- **Feature name**: Implementation-workflow interaction policies (worker batch cap, unlimited ask-first questions, pre-implementation change summary)
- **Slug**: `workflow-interaction-policies`
- **Workflow session**: `spec-workflow-interaction-policies` · workflow: spec-driven (Medium-Large)
- **Branch**: `spec/workflow-interaction-policies` from `main` @ v1.44.0 (`6c438a98`), worktree
  `/Users/luizmassa/Projects/massa-ai-wt-workflow-interaction-policies`

## Problem Statement

Three interaction policies of the massa-ai workflow harness diverge from how the operator
wants implementation sessions to run:

1. **Batch workers are too coarse.** The spec-driven Execute phase packs phases into
   ~7-task batches per worker ("benchmarked sweet spot"). The operator wants small
   workers: max 3 tasks per worker, ideal 2. The packing budget is restated throughout
   4 files (`sub-agents.md`, `tasks.md`, `execute.md`, `workflows/spec-driven.md`),
   including worked examples, the offer script, a diagram, a coarse-phase caveat
   (~1.5× budget / ~10+ tasks, with a "tight dependency chain" exception), and derived
   phrasing ("a 4–8-task feature packs into a single batch", "~20 tasks → 3 workers",
   "ceil(T / 7)").
2. **Question counts are capped.** `references/spec-driven/discuss.md` caps Guided mode at
   "≤2 independent questions per turn"; `references/tdd/discovery-and-sizing.md` AND
   `workflows/tdd.md` (line 35) cap at "at most three related questions";
   `workflows/design.md` says "Ask only when … stay ambiguous". The operator wants no
   numeric limit on questions anywhere a workflow interviews the user, and an ask-first
   stance: when in doubt, unsure, or facing an important decision — ask, don't assume.
3. **No pre-implementation change summary.** No workflow requires presenting a compact,
   task-separated list of the changes about to be made before implementation starts. The
   operator wants that summary in every implementation workflow, in a specific shape
   (`- T01` items with `--` sub-items, medium-length phrases, clear/direct/objective).

Batch workers exist only in the spec-driven family (verified by sweep); fix-family
workflows dispatch `massa-ai-builder` per single finding or disjoint file group, which is
already within the new cap and needs no change. All 16 implementation workflows already
load `references/implementation-delivery.md` before the first repository mutation, which
makes it the single-source home for the summary contract.

## Decisions Confirmed With The User (2026-08-09)

1. **Packing conflict resolution**: phases are sized ≤3 tasks (ideal 2) at Tasks time; the
   whole-phase-per-worker invariant and phase-boundary-only cuts stay exact.
2. **Question-cap removal scope**: spec-driven + all implementation workflows + tdd's
   discovery interview (planning workflow included by choice).
3. **Assume policy**: ask-first for important or uncertain decisions; genuinely trivial,
   safe details may still be assumed and recorded.
4. **Summary contract home**: one canonical stage in `references/implementation-delivery.md`
   inherited by all 16 implementation workflows; `execute.md` adds only spec-driven's
   ordering hook (summary rides the pre-Execute sub-agent offer message).
5. **Post-critique (Plan Challenge, pre-mortem, same date)**: the coarse-phase caveat and
   the "tight dependency chain cannot be split" exception are **deleted**, superseded by
   the hard ≤3 rule — consistent with the user's rejection of the soft-cap option in
   decision 1. `workflows/tdd.md:35` joins the question-cap removal inventory.
6. **Deterministic phase-size enforcement**: `validate_tasks.ts` gains a per-phase task
   count check at **error** level (>3 tasks in a phase fails), with an observed-red test;
   golden fixtures updated deliberately if the new check fires on them (user choice).

## Goals

- Every batch worker in spec-driven Execute receives at most 3 tasks, ideally 2.
- No numeric question cap survives in spec-driven, tdd discovery, or any implementation
  workflow; ask-first-when-in-doubt is the recorded stance.
- Every implementation workflow presents a task-separated change summary before the first
  implementation mutation, in the operator's requested shape.
- All mirrors of the packing numbers stay mutually consistent; generated plugin bundles
  regenerate cleanly; parity suites stay green.

## Out of Scope

| Item | Reason |
| --- | --- |
| Updating installed host copies under `~/.claude/` | `scripts/install-skills.sh --apply` owns that; permission classifier blocks live `~/.claude` writes from a session. User reinstalls after merge. |
| Fix-family builder dispatch changes | Already per-finding (≤ cap); verified by sweep, no edit needed. |
| Broader single-sourcing of spec-driven packing prose | Owned by the in-progress `skills-directive-dedup` feature; this feature only updates the numbers consistently at existing sites. |
| Re-benchmarking worker sizes | The new cap is an operator directive, not a measurement; the stale "benchmarked sweet spot" claim is removed, not replaced with a new unmeasured claim. |
| Audit workflows (`*-audit`, `exploration`, `the-fool`) | Read-only; they never load the delivery protocol and make no implementation mutations. |
| Sub-agent offer trigger threshold | Stays at >3 tasks (set by the operator previously); only the per-worker budget changes. |

## Assumptions & Open Questions

| Assumption | Chosen default | Rationale |
| --- | --- | --- |
| Summary presentation moment in non-spec-driven workflows | Stage 1.5 text is self-sufficient: it attaches the summary to the Stage 3 authorization ask defined in the same shared reference; the six workflows without their own authorization sentence are audited in T5, anchors added only on contradiction | Avoids a second prompt; the pause is defined by the shared chain all 16 workflows load, and the audit (not assumption) covers the six named by the plan critic |
| Legacy `tasks.md` artifacts vs the new validator error | The >3-tasks-per-phase error re-gates nothing automatically: `validate_tasks.ts` runs on demand per feature; golden fixture entries the check fires on are updated deliberately and named in the PR | Old completed features are history, not re-opened work; the golden suite pins recorded contract output, so a behavior change legitimately re-records it |
| Worker-count growth is acceptable | A ~20-task feature now packs into ~7–10 sequential workers instead of ~3 | Direct consequence of the operator's max-3/ideal-2 directive; sequential execution and compact summaries keep the main window lean |
| Context-sizing signal (~40k tokens) in `sub-agents.md` | Kept unchanged | Still a valid upper bound; rarely binding at 2–3 tasks per worker |
| `execute.md` over-sized-phase handling | A phase exceeding 3 tasks at Execute is a Tasks-phase defect: stop and split it during Tasks (existing safety-valve pattern, re-pointed at the new budget) | Preserves the whole-phase invariant chosen by the operator |
| Quick mode | The summary stage applies to Quick mode too (a 1-task summary is 2–3 lines) | Cheap, uniform, no exemption class to police |

**Open questions:** none — all four scoping decisions were resolved with the user on
2026-08-09 (see Decisions section).

## User Stories

### P1: Small batch workers ⭐ MVP

As the operator, I want every spec-driven batch worker to carry at most 3 tasks (ideal 2),
so worker context stays small and each compact summary lands more often.

**Acceptance Criteria**:

1. WHEN spec-driven Execute packs phases into batches, the packing budget SHALL be max 3
   tasks per worker with 2 as the stated ideal, at every site that states a budget
   (`sub-agents.md`, `tasks.md`, `execute.md`, `workflows/spec-driven.md`).
2. WHEN the Tasks phase sizes phases, each phase SHALL contain at most 3 tasks (ideal 2),
   and the whole-phase-per-worker invariant with phase-boundary-only cuts SHALL remain
   stated unchanged.
3. WHEN a formal `tasks.md` has more than 3 tasks, the sub-agent offer SHALL still fire
   (trigger unchanged), and derived prose SHALL be consistent with the new budget: no
   "4–8-task single batch" claim, worked examples and the offer script recomputed, the
   `ceil(T / 7)` formula and "~20 tasks → 3 workers" / "benchmarked sweet spot" claims
   replaced with budget-consistent text.
4. IF a phase exceeds 3 tasks at Execute packing time, the workflow SHALL treat it as a
   wrongly-sized Tasks artifact and route back to the Tasks split guidance (safety valve),
   not silently assign an over-budget worker.
5. The coarse-phase caveat and tight-chain exception SHALL be removed from both
   `sub-agents.md` and `tasks.md` (`~1.5× the budget`, `~10+ tasks`, "genuinely cannot
   be split") — the ≤3 rule is hard, with no fat-phase carve-out.
6. WHEN `validate_tasks.ts` parses a Task Breakdown, it SHALL report an error for any
   phase holding more than 3 tasks, proven by a red test on a 4-task-phase fixture and a
   green run on this feature's own tasks.md; golden fixture entries the new check fires
   on SHALL be updated deliberately and named in the PR description.

### P1: Unlimited ask-first questions

As the operator, I want workflows to ask as many questions as they need and to ask rather
than assume whenever in doubt or facing an important decision.

**Acceptance Criteria**:

1. The spec-driven discuss reference SHALL contain no numeric per-turn question cap; the
   "≤2 independent questions per turn" rule is replaced with no-cap guidance that keeps
   dependency-ordered pacing (one-at-a-time only when answers depend on each other).
2. The discuss reference SHALL state ask-first for important or uncertain decisions, WHILE
   permitting genuinely trivial, safe details to be assumed and recorded.
3. The tdd discovery clarification policy SHALL contain no numeric question cap in either
   `references/tdd/discovery-and-sizing.md` or `workflows/tdd.md` ("at most three related
   questions" removed from both) and SHALL direct asking when in doubt.
4. The specify reference SHALL state that there is no limit on the number of clarifying
   questions and that important open decisions are asked, not assumed.
5. WHEN the Closure Gate logs an assumption unasked, that path SHALL be restricted to
   genuinely trivial/safe details or explicitly user-deferred questions; important
   decisions SHALL be resolved by asking.
6. WHERE `workflows/design.md` limits asking, the text SHALL be rephrased to direct
   asking whenever doubt remains after source inspection.

### P1: Pre-implementation change summary

As the operator, I want a compact task-separated list of the changes about to be made,
before any implementation workflow starts editing, so I can catch scope drift early.

**Acceptance Criteria**:

1. WHEN an implementation workflow nears its first mutation, the delivery protocol SHALL
   require presenting a change summary first: one list, separated by tasks (`- T01` style
   items with `--` sub-items), medium-length phrases, clear/direct/objective, including
   the operator's example shape, stated in `references/implementation-delivery.md`.
2. The summary contract SHALL live only in `references/implementation-delivery.md` (new
   chain stage between Isolate and Implement); no per-workflow restatement, and the chain
   table SHALL gain the matching row.
3. WHEN spec-driven Execute starts with a formal `tasks.md`, the summary SHALL be derived
   from the approved spec/design/tasks artifacts and presented in the same pre-Execute
   message as the sub-agent offer; WHEN a workflow has no formal tasks, the summary SHALL
   be organized by the plan's logical work items from the conversation.
4. The summary stage SHALL apply to Quick mode as well (single-task summary allowed).
5. The Stage 1.5 text SHALL be self-sufficient: it attaches the summary to the Stage 3
   delivery-authorization ask defined in the same reference, so a workflow with no
   authorization sentence of its own still gets the pause; the six workflows lacking such
   a sentence (debug, design, maestro, maestro-fix, tests-fix, implementation-fix) SHALL
   be audited for contradicting step sequences, adding an anchor line only where a
   contradiction is found.

### P2: Consistency and delivery

As the maintainer, I want the change to ship without breaking generated artifacts,
parity suites, or the release chain.

**Acceptance Criteria**:

1. WHEN `bun run generate:artifacts` runs after the edits, it SHALL exit 0 and
   `--check` SHALL report no drift; the skill-artifact parity and subagent parity suites
   SHALL pass.
2. The `CHANGELOG.md` `[Unreleased]` section SHALL gain an entry describing the three
   policy changes.
3. WHERE an edited workflow file carries a frontmatter version, that version SHALL be
   bumped once per edited file (`metadata.version`).

## Edge Cases

- A legacy `tasks.md` authored before this change with a 5-task phase: Execute packing
  routes back to Tasks for a split (AC P1-1.4) instead of assigning an over-budget worker.
- A 4-task feature: trigger fires, packing now yields 2 workers (2+2) — the old "single
  batch" claim would be wrong, hence its removal.
- A workflow with no formal tasks (debug, quick fix): summary organized by logical work
  items; a single-item summary is valid.
- Question pacing: no cap does not mean interrogation dumps — dependency-ordered pacing
  and grouping guidance stay; only numeric limits go.

## Requirement Traceability

| ID | Requirement | Story | Status |
| --- | --- | --- | --- |
| WF-01 | Packing budget max 3 / ideal 2 at all 15 budget sites in 4 files | Small batch workers | pending |
| WF-02 | Tasks-phase granularity: phases ≤3 tasks (ideal 2); whole-phase invariant unchanged | Small batch workers | pending |
| WF-03 | Derived prose recomputed (examples, offer script, diagram, formula, no stale benchmark claim); trigger >3 unchanged | Small batch workers | pending |
| WF-04 | Over-sized phase at Execute routes back to Tasks split guidance | Small batch workers | pending |
| WF-05 | discuss.md: numeric cap removed; ask-first important / assume trivial recorded | Unlimited ask-first questions | pending |
| WF-06 | tdd caps removed in discovery-and-sizing.md AND workflows/tdd.md:35; ask when in doubt | Unlimited ask-first questions | pending |
| WF-07 | specify.md Clarify: no question limit; important decisions asked | Unlimited ask-first questions | pending |
| WF-08 | specify.md Closure Gate: assumption-without-asking path restricted to trivial/safe or user-deferred | Unlimited ask-first questions | pending |
| WF-09 | design.md ask-limiter rephrased to ask-whenever-in-doubt | Unlimited ask-first questions | pending |
| WF-10 | implementation-delivery.md: new Summarize stage (table row + section + example shape) | Pre-implementation change summary | pending |
| WF-11 | execute.md: summary derived from artifacts, presented with the sub-agent offer message | Pre-implementation change summary | pending |
| WF-12 | workflows/spec-driven.md mirrors updated + summary mention + version bump | Small batch workers | pending |
| WF-13 | Artifacts regenerate clean; parity suites green | Consistency and delivery | pending |
| WF-14 | CHANGELOG [Unreleased] entry | Consistency and delivery | pending |
| WF-15 | Coarse-phase caveat + tight-chain exception deleted from sub-agents.md and tasks.md; Stage 1.5 self-sufficient + six-workflow pause audit | Small batch workers / Pre-implementation change summary | pending |
| WF-16 | validate_tasks.ts per-phase >3-task error, observed-red test, deliberate golden updates | Consistency and delivery | pending |

## Success Criteria

- A grep for `~7` / `7-task` / `7 tasks` / `4–8` / `20 tasks → 3` / `1.5×` / `10+ tasks` /
  `tight dependency chain` over `skills/` returns no packing-budget hits; the new budget
  (max 3, ideal 2) appears at the canonical site and its mirrors consistently.
- A grep for `≤2 independent`, `at most three`, and sibling numeric caps (`at most 2`,
  `3+ questions`) over `skills/` returns nothing question-related (cap sites removed:
  discuss.md Tips + Guided algorithm body, discovery-and-sizing.md, workflows/tdd.md,
  ticket/intake-and-sources.md — "no stragglers" per the user's cap-removal choice —
  plus workflows/design.md's "Ask only when" rephrased).
- `validate_tasks.ts` errors on a 4-task-phase fixture (observed red) and passes this
  feature's own tasks.md; golden + validator suites green after any deliberate
  re-recording.
- `references/implementation-delivery.md` chain table has a Summarize stage between
  Isolate and Implement, and its section includes the operator's `- T01` / `--` example.
- `bun run generate:artifacts` exits 0; `bun skills/massa-ai/scripts/validate_spec.ts
  workflow-interaction-policies` exits 0; parity suites pass.
