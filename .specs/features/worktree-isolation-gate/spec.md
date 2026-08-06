# Spec — Worktree Isolation Gate (explicit per-workflow step)

- projectId: `massa-ai` · workflowSessionId: `spec-worktree-isolation-gate`
- Workflow: spec-driven (Medium→Large: 16 workflow files + 1 reference + 1 test + CHANGELOG)
- Branch: `spec/worktree-isolation-gate` (worktree `/Users/luizmassa/Projects/massa-ai-wt-worktree-isolation-step`, base origin/main @ v1.32.0)

## Problem

The worktree+branch isolation contract exists (`references/implementation-delivery.md`
Stage 0–1, loaded by all 16 implementation workflows via the preamble clause) but is
textually a *load instruction*, not an *action step*. Sessions skip it in practice:
`.specs/project/STATE.md` records a cross-session incident where two spec-driven
sessions shared one checkout, a branch moved under a running agent, and commits landed
on the wrong branch. User direction (2026-08-06): strengthen enforcement with an
explicit gate step in every implementation workflow, factored through the shared
reference — no repeated policy text. Hook-level blocking was considered and deferred
(see design.md D2).

## Requirements

- **R1** — Every implementation workflow (the 16-file set locked by
  `scripts/__tests__/workflow-harness-contract.test.ts`) carries one explicit,
  identically-worded **Isolation Gate** line instructing worktree+branch creation
  (`implementation-delivery.md` Stage 0–1) **before the first file edit**, with
  evidence recording (worktree path + branch, or a legal skip reason verbatim).
- **R2** — Policy text lives once, in `references/implementation-delivery.md`; the
  per-workflow line only invokes it. Stage 1 gains the shared-checkout rule: never
  switch branches in a checkout another session may share; record worktree path +
  branch immediately after creation.
- **R3** — A discriminating sensor in `workflow-harness-contract.test.ts` asserts the
  gate line in all 16 implementation workflows AND its absence from the read-only
  complement (both directions, per that file's pattern). Sensor observed RED before
  the workflow edits land.
- **R4** — All existing skills gates stay green with no ceiling raise: duplication
  excess ≤ 483 @ window 4, size budgets, harness integrity, metadata headers, venue
  parity, doc paths, generate:artifacts --check.
- **R5** — CHANGELOG entry under `[Unreleased]`.

## Acceptance Criteria

- **AC1** — `grep -l 'Isolation Gate'` over `skills/massa-ai/workflows/**` matches
  exactly the 16 implementation workflow files.
- **AC2** — The gate line in each workflow names: before the first file edit,
  Stage 0–1 of `references/implementation-delivery.md`, and evidence recording.
- **AC3** — New harness-contract tests fail on origin/main content (observed red)
  and pass after the edits; deleting the gate line from any one workflow flips
  exactly one assertion.
- **AC4** — `implementation-delivery.md` Stage 1 contains the shared-checkout rule
  and the record-evidence requirement.
- **AC5** — Gate suite green in the worktree: workflow-harness-contract,
  skills-duplication-metric (excess ≤ 483), skill-size-budgets,
  workflow-metadata-headers, skill-doc-paths, skills-harness-integrity,
  check-workflow-venue-parity, generate:artifacts --check.
- **AC6** — CHANGELOG `[Unreleased]` names the gate and the 16-workflow scope.

## Out of scope

- Hook-level blocking of Edit/Write on a shared checkout's default branch
  (`massa-ai-hook.ts` contract is observation-only "never blocks the agent";
  changing that is its own feature — design.md D2).
- `references/hook-enforcement.md` staleness (describes Python hooks that do not
  exist on disk) — pre-existing, recorded as observation only.
- Renumbering workflow step lists (breaks cross-references, e.g.
  implementation-delivery.md cites "spec-driven.md step 7").

## Assumptions (accepted)

- A single-line gate placed directly after the existing preamble delivery clause
  creates a 3-line identical run (< window 4), adding zero duplication excess.
  Empirically confirmed pre-implementation by the Plan Challenge critic (scratch
  copy, exact gate line into all 16 files, `measure(root,4)`: 483 → 483, delta 0).
  Ceiling raise is refused.
- Placement in the preamble (not the numbered list) satisfies the user's
  "explicit step" intent; the sensor enforces presence, position after the
  delivery-clause paragraph keeps it pre-mutation.
- **Efficacy accepted risk (Plan Challenge F1):** every AC here is textual
  presence or gate mechanics; no test in this repo can verify that sessions
  actually create worktrees. The spec's own Problem statement is "agents skipped
  an existing instruction" — a more emphatic instruction is a mitigation, not a
  proof. The behavioral falsifier is a future repeat shared-checkout incident in
  `.specs/project/STATE.md`. Hook-level enforcement remains the escalation path
  (design.md D2) and is deliberately a separate feature.

## Managed-harness protocol mapping (CONTRIBUTING.md, Plan Challenge F5)

Step 1 contract = this spec; Step 2 register = pre-existing
`IMPLEMENTATION_WORKFLOWS` set in `workflow-harness-contract.test.ts` (untouched
population, derived from disk); Step 6 invariants = design D4 wording invariant;
Step 7 discriminating tests = T2 sensor (observed red first). Steps 3–5
(preserve argv / read-only export / deliver-before-ack) are inapplicable to a
static prose contract change — no command wrapping, no runtime state, no async
delivery.
