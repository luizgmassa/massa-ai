# Discovery Workflow Validation

**Date**: 2026-08-05
**Spec**: `.specs/features/discovery-workflow/spec.md`
**Diff range**: `e67700d1..HEAD` (HEAD = `66bb6e80`)
**Verifier**: independent sub-agent (author != verifier); read-only over the
real worktree, all mutations run in a scratch `git worktree`, discarded
before verdict.

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | Done    | `f83fe38a` — `skills/massa-ai/workflows/discovery.md` created |
| T2   | Done    | `231a9357` — router row + tier-4 clause in `skills/massa-ai/SKILL.md` |
| T3   | Done    | `5330337f` (count locks) + `01073577` (license allowlist amendment) |
| T4   | Done    | `1e14716a` — CHANGELOG entry under `[Unreleased]` / `### Added` |
| T5   | Done    | Gate matrix re-run below, all green |
| T6   | Done (this report closes it) | State files (`STATE.md`, `FEATURES.json`, `HANDOFF.md`) already updated by the author; this validation.md was missing prior to this session — written now |

---

## Spec-Anchored Acceptance Criteria

| Requirement | Criterion | Spec-defined outcome | `file:line` + evidence | Result |
| --- | --- | --- | --- | --- |
| DSC-01 | frontmatter parses, name/license/version | `Bun.YAML.parse` succeeds, `name: discovery`, `license: Apache-2.0`, `metadata.version: "1.0.0"` | `skills/massa-ai/workflows/discovery.md:2-6` — parsed via `Bun.YAML.parse`, output `{name:"discovery", license:"Apache-2.0", metadata:{version:"1.0.0"}}` | PASS |
| DSC-01 AC1 | intake line present | literal `references/project-context.md` | `skills/massa-ai/workflows/discovery.md:27` — `grep -c` = 1 | PASS |
| DSC-01 AC2 | no delivery-scope leak | no `implementation-delivery.md` string | `skills/massa-ai/workflows/discovery.md` — `grep -c "implementation-delivery"` = 0 | PASS |
| DSC-01 AC3 | attribution line | names product-brainstorming, anthropics/knowledge-work-plugins, Apache-2.0 | `skills/massa-ai/workflows/discovery.md:11-12` | PASS |
| DSC-02 AC1 | router row + tier-4 clause, exactly 2 new sites | `grep -n discovery` shows table row + precedence clause only, no other new text | `skills/massa-ai/SKILL.md:170` (row), `:187` (clause); `git diff 231a9357^..231a9357 -- skills/massa-ai/SKILL.md` shows exactly 2 inserted lines, both containing the only 2 new "discovery" occurrences across the whole `e67700d1..HEAD` diff for this file (verified via `git diff e67700d1..HEAD -- skills/massa-ai/SKILL.md \| grep discovery` = same 2 lines) | PASS |
| DSC-02 AC2 | byte ceiling | `wc -c` <= 21000, size-budget suite green | `skills/massa-ai/SKILL.md` = 20293 B; `scripts/__tests__/skill-size-budgets.test.ts` 6/6 pass | PASS |
| DSC-03 AC1 | 4 mode headings, non-empty bodies | Problem Exploration, Solution Ideation, Assumption Testing, Strategy Exploration | `skills/massa-ai/workflows/discovery.md:49,61,73,83` — all 4 headings present, each followed by non-empty prose (verified by direct read) | PASS |
| DSC-04 AC1 | 7 framework names + no-dumping rule | HMW, JTBD, Opportunity Solution Trees, First Principles, SCAMPER, OODA Loop, Reverse Brainstorming; explicit no-checklist rule | `skills/massa-ai/workflows/discovery.md:97-123` (all 7, one bullet each); `:94-95` — "never dump frameworks or force the conversation through them as a checklist" | PASS |
| DSC-05 AC1 | 5 stages in order, non-empty | Frame, Diverge, Provoke, Converge, Capture | `skills/massa-ai/workflows/discovery.md:130,135,139,143,148` — ordered 1-5, each non-empty | PASS |
| DSC-05 AC2 | Capture output includes assumptions-to-test + set-aside | assumptions to test, questions to research, next steps, set-aside ideas | `skills/massa-ai/workflows/discovery.md:149-151` — "the assumptions to test, the questions to research, the suggested next steps, and what was explicitly set aside" | PASS |
| DSC-06 AC1 | Do/Do-Not + 6 anti-patterns | conduct contract + 6 named anti-patterns with counters | `skills/massa-ai/workflows/discovery.md:185` (Do:), `:200` (Do not:), `:212-227` — exactly 6 anti-pattern bullets (Solutioning before framing, feature-parity trap, anchoring on constraints, one-idea brainstorm, analysis paralysis, brainstorming-vs-researching), each with a counter-move | PASS |
| DSC-07 AC1 | session-id, recall, remember, degradation clauses | `workflowSessionId: discovery-<entity>`; budgeted recall; remember at Capture; graceful degradation | `skills/massa-ai/workflows/discovery.md:33` (session id), `:35-39` (budgeted recall, limit<=3/minImportance>=0.7), `:153-159` (remember at Capture, tag set), `:40-42` + `:158-159` (degradation, twice) | PASS |
| DSC-08 AC1 | to-prd handoff, mandatory offer, accept/decline | names `to-prd` + `workflows/to-prd.md`; offer mandatory; acceptance = explicit request | `skills/massa-ai/workflows/discovery.md:161-181` — heading "PRD Handoff (to-prd)", `:170` "route to `workflows/to-prd.md`", `:171` "acceptance is the explicit request `to-prd`'s routing requires", `:175` decline branch | PASS |
| DSC-09 AC1 | count locks 39->40, complement 23->24, observed red then green | both suites red before T1 exists (39/23), green after T3 (40/24) | `scripts/__tests__/workflow-harness-contract.test.ts:39,254`; `scripts/__tests__/workflow-metadata-headers.test.ts:32` — independently reproduced red state by checking out commit `231a9357` (T1+T2, pre-T3) into a scratch worktree: both suites fail expecting 39/23, received 40/24 (file present but locks not yet bumped); green after `5330337f` — verified live in this session (below) | PASS |
| DSC-09 AC2 | regen + parity, gates green | `generate:artifacts --check` no drift; integrity/duplication/parity/size green; doc-paths 0 misses; lint 0 | Verifier-owned re-run below — all green | PASS |
| DSC-09 AC3 | CHANGELOG entry | `[Unreleased]` -> `### Added` | `CHANGELOG.md:8-27` — entry present under `## [Unreleased]` / `### Added` | PASS |

**Status**: All 15 lettered/AC-numbered criteria PASS. No spec-precision gaps.

---

## Discrimination Sensor

Scratch: `git worktree add /tmp/discovery-scratch HEAD` (detached at `66bb6e80`). Real-tree baseline `git status --porcelain` was empty before sensor work and confirmed empty after. Each mutation's pre-image hash was captured with `git hash-object` before mutating, then restored with `git checkout --` and the post-restore hash diffed against the captured pre-image hash (not memory).

| # | File:line | Mutation | Pre-hash | Post-restore hash match | Killed? |
| - | --- | --- | --- | --- | --- |
| A | `skills/massa-ai/workflows/discovery.md:27` | Deleted the `references/project-context.md` intake line | `f25860a4...` | Yes | Killed — `workflow-harness-contract.test.ts` intake test: expected `[]`, got `["discovery.md"]` |
| B | `skills/massa-ai/workflows/discovery.md` (appended) | Injected `references/implementation-delivery.md` string (complement leak) | `f25860a4...` | Yes | Killed — `workflow-harness-contract.test.ts` delivery-scope test: expected `[]`, got `["discovery.md"]` |
| C | `skills/massa-ai/workflows/discovery.md:4` | Changed `license: Apache-2.0` -> `license: GPL-3.0` | `f25860a4...` | Yes | Killed — `workflow-metadata-headers.test.ts`: `license: expected one of ["MIT","CC-BY-4.0","Apache-2.0"], got "GPL-3.0"` |
| D | `skills/massa-ai/workflows/discovery.md` (deleted) | Removed the file entirely | `f25860a4...` | Yes | Killed — 3 failures across both suites: WMH population 40->39, harness-contract 40-lock 40->39, complement lock 24->23 |

**Mutation population**: 4 injected, 4 killed, 0 survived.
**Sensor depth**: lightweight (default tier; feature is a docs/harness-only route, not P0).
**Result**: 4/4 killed — PASS.

**Isolation verification**: `git status --porcelain` on the real worktree matched the pre-sensor baseline (both empty) after every mutation's restore and after final worktree removal (`git worktree remove --force /tmp/discovery-scratch`). `git worktree list` post-cleanup shows no scratch entry.

---

## Interactive UAT

`UAT: not applicable` — harness-only / prose-workflow feature with no UI. All acceptance criteria are covered by file-content sensors (grep/parse) and automated suites; the spec itself routes verification to "clause-by-clause read" for DSC-03..DSC-08, which this report performs directly above.

---

## Code Quality

| Principle | Status | Notes |
| --- | --- | --- |
| No features beyond what was asked | PASS | Diff is exactly: 1 new workflow file, 1 SKILL.md router registration (2 lines), 2 count-lock integer edits + 1 license-allowlist edit, 1 CHANGELOG entry, `.specs/` state files. Matches design D1-D6 scope precisely. |
| No abstractions for single-use code | PASS | Pure prose file; no code added. |
| No unnecessary "flexibility" added | PASS | — |
| Only touched files required for task | PASS | `git diff --stat e67700d1..HEAD` = 8 files, all named in the feature surface or `.specs/` state (no stray edits). |
| Didn't "improve" unrelated code | PASS | The 3 pre-existing incidental "discovery" mentions in SKILL.md (bug discovery, broad discovery, repo-rules-discovery.md) are untouched — confirmed via diff. |
| Matches existing patterns/style | PASS | Frontmatter shape, attribution-line pattern, and router-row/precedence-clause wording mirror `pr-review.md`'s and `to-prd`'s established conventions. |
| Would senior engineer approve? | PASS | — |
| Tests map to acceptance criteria, non-shallow | PASS | Spot-checked DSC-01/DSC-09: WMH and harness-contract assertions target exact counts/strings, not existence-only. |
| Spec-anchored outcome check | PASS | See AC table above — every asserted value (counts 40/24, license string, literal paths) matches the spec-defined precise outcome. |
| Per-layer coverage (domain 1:1 ACs; no routes/e2e in scope) | PASS | This feature has no routes; domain "logic" is prose content, verified 1:1 against every lettered AC. |
| Every test maps to a spec AC — no unclaimed tests | PASS | The two edited count-lock suites and the license-allowlist edit map directly to DSC-09 AC1/AC2; no unrelated test changes present in the diff. |
| Documented guidelines followed | PASS | `CONTRIBUTING.md` CHANGELOG-authoring rules followed (entry under `### Added`); `AGENTS.md` `.specs/` conventions followed. |

---

## Edge Cases

- [x] Route collision between `discovery` and `exploration` vocabulary (R2 in design.md): tier-4 clause explicitly scopes discovery to "product problem, idea, or direction with no concrete code target" vs. `exploration`'s codebase-understanding meaning — text confirmed at `SKILL.md:187`.
- [x] MCP-unavailable degradation: stated twice in the workflow (session-start recall, `discovery.md:40-42`; Capture persistence, `:158-159`) — both say "continue"/"stays in conversation," not a hard failure.
- [x] Declined PRD offer: capture summary stays in conversation, no further offer — `discovery.md:175-176`.
- [x] Non-PRD-shaped session (pure exploration): workflow explicitly instructs naming the research gap instead of offering an empty PRD — `discovery.md:178-181`.
- [x] SKILL.md byte ceiling (R1): 20293 B measured against 21000 ceiling — 707 B headroom, size-budget suite green.

---

## Gate Check

- **Gate commands** (verifier-owned re-runs, all from a clean, committed tree):
  - `bun test scripts/__tests__/workflow-harness-contract.test.ts scripts/__tests__/workflow-metadata-headers.test.ts scripts/__tests__/skills-harness-integrity.test.ts scripts/__tests__/skill-size-budgets.test.ts` -> **88 pass, 0 fail** (288 expect() calls)
  - `bun test scripts/__tests__/skills-duplication-metric.test.ts scripts/__tests__/skill-artifact-parity.test.ts` -> **43 pass, 0 fail** (1029 expect() calls)
  - `bun scripts/generate-skill-artifacts.ts --check` -> "No drift: generated skill bundles match checked-in files." (exit 0)
  - `wc -c skills/massa-ai/SKILL.md` -> 20293 (<= 21000)
  - `bun scripts/check-skill-doc-paths.ts` -> "scanned 160 md files, 1167 citations, 0 misses" (exit 0)
  - `bun run lint` -> oxlint, exit 0
  - `bun skills/massa-ai/scripts/check_specs_delivered.ts discovery-workflow --root .` -> "0 error(s)" (exit 0)
  - `bun skills/massa-ai/scripts/validate_state.ts --root .` -> exit 1, **51 pre-existing errors** across historical features, run BEFORE this report existed (`discovery-workflow` was not yet a cross-check target — no `validation.md`, and `tasks.md` still carries unchecked `- [ ]` boxes, so `appearsComplete()` was false). After writing this report: `bun skills/massa-ai/scripts/validate_state.ts discovery-workflow --root .` -> **0 error(s) across [discovery-workflow]**, exit 0 (deterministic backing: real PASS verdict + file:line evidence present, confirmed live). Re-running the full cross-check after this report was written still totals **51** (`discovery-workflow` now appears as a checked target but contributes 0 errors to the total) — this feature contributes **0 new errors** to the registry, exactly the DSC-09/T6 gate. Parsed population confirmed by counting `^  ERROR` lines both before (51) and after (51, with `discovery-workflow` present as a 0-error target).
- **Total test count (named gate suites)**: 88 + 43 = 131 passed, 0 failed, 0 skipped.
- **Test count before feature**: 39-lock / 23-complement (pre-T1, reproduced live below).
- **Test count after feature**: 40-lock / 24-complement (current, green).
- **Delta**: +1 new workflow file added to both locked populations; test *file* count in the two count-lock suites unchanged (assertions edited, not added/removed) — this is a docs-population lock, not a code-coverage delta.
- **Skipped tests**: none in the gates run.
- **Failures**: none in the gates run.
- **Observed-red ordering re-derivation (DSC-09 AC1)**: checked out commit `231a9357` (T1 file + T2 router registration, pre-T3) into a scratch worktree and ran both count-lock suites live in this session: both failed — `workflow-harness-contract.test.ts` "exactly 40 workflow files exist" got 39 (still locked at old value while file exists), "read-only complement is exactly 24" got 23; `workflow-metadata-headers.test.ts` implicitly the same via the shared `EXPECTED_WORKFLOW_COUNT`. This independently reproduces the author's claimed red state rather than trusting the claim. Worktree discarded, real tree unaffected (`git status --porcelain` empty before and after).
- `bun run test:scripts` was **not** re-run in full per the task brief (documented 4 pre-existing `.claude/worktrees/` needle-anchor contamination fails, CI-authoritative, unrelated to this feature's diff surface) — the named suites above are the sufficient sensor set for this feature and were all re-run directly.

---

## Fix Plans

None. No gaps or surviving mutants found.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| DSC-01 | Implementing | Verified |
| DSC-02 | Implementing | Verified |
| DSC-03 | Implementing | Verified |
| DSC-04 | Implementing | Verified |
| DSC-05 | Implementing | Verified |
| DSC-06 | Implementing | Verified |
| DSC-07 | Implementing | Verified |
| DSC-08 | Implementing | Verified |
| DSC-09 | Implementing | Verified |

Note (verifier restriction): this table records the traceability status as
observed; the verifier does not edit `spec.md` or `FEATURES.json` directly
(never modifies implementation/spec artifacts) — the author/orchestrator
should apply this table's status to `spec.md` and flip
`.specs/project/FEATURES.json`'s `discovery-workflow.status` from
`in-progress` to its verified/complete value as the closing T6 step.

---

## Summary

**Overall**: Ready
**Result**: PASS

**Spec-anchored check**: 15/15 lettered/numbered ACs matched spec outcome; 0 spec-precision gaps.
**Sensor**: 4/4 mutations killed, 0 survived.
**Gate**: 131 passed (named suites) + 3 standalone tool gates green, 0 failed.

**What works**: The `discovery` workflow file exists with valid, gate-compliant frontmatter; carries the required intake line and stays out of the delivery-scope (read-only) complement; carries correct provenance/attribution for its Apache-2.0 upstream; all four modes, seven frameworks, five session stages, conduct contract with all six named anti-patterns, massa-ai session/memory binding, and the mandatory to-prd handoff offer are present and textually verified against the spec's clauses. Router registration is exactly the two intentional sites the spec calls for, under the byte ceiling. Both count-lock suites and the license allowlist were independently re-derived through the observed-red-then-green sequence, not just trusted from the author's commit messages. The discrimination sensor's four independently-chosen mutations were each killed by the existing suites, run in an isolated scratch worktree with hash-verified restoration and confirmed real-tree isolation.

**Issues found**: None.

**Next steps**: Flip `.specs/project/FEATURES.json`'s `discovery-workflow.status` and `spec.md`'s per-requirement statuses to verified/complete (author/orchestrator action, per the Requirement Traceability Update note above); the push/PR decision (including the recorded cross-session `c4b4d6cb` incident repair) remains the user's call as already recorded in `STATE.md`/`HANDOFF.md`.
