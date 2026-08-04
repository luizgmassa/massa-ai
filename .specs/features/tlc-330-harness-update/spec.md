# TLC 3.3.0 Harness Update Specification

- **Slug:** `tlc-330-harness-update`
- **workflowSessionId:** `spec-harness-330-update`
- **Workflow:** spec-driven (Large — Specify + Design + Tasks + full Plan Challenge + Execute + independent validation)
- **Branch:** `spec/tlc-330-harness-update`, worktree `.claude/worktrees/tlc-330-harness-update`, from `origin/main` @ `066e86e` (v1.20.0)
- **Sources:** upstream TLC spec-driven 3.3.0 at `~/Projects/tlc-agent-skills/packages/skills-catalog/skills/(development)/tlc-spec-driven/` (SKILL.md `metadata.version: 3.3.0`); three independent comparison-agent reports (2026-08-04), load-bearing claims re-verified in-session against source (see Evidence below).
- **User decisions (2026-08-04, interactive):** one feature/one PR; full 3.3.0 sync depth; batching trigger lowered to **>3 tasks** (offer-then-confirm retained; no auto-batch, no parallel batches, no read-only fan-out codification); PR gate = prose + deterministic script.

## Problem Statement

The massa-ai spec-driven workflow is an adapted fork of TLC spec-driven, now behind upstream 3.3.0. Verified gaps: (1) every structural gate (spec closure, tasks pre-approval, commit format, completion) is prose the model must remember — zero deterministic validator scripts exist (`skills/massa-ai/scripts/` holds only `lessons.py`); (2) the discrimination sensor still permits `git stash` (`validate.md:104`, `sub-agents.md:124`), the exact failure mode recorded in this project's own lessons (mutation harnesses must not restore with git); (3) `execute.md` commits code (§7, line 229) before marking `tasks.md` complete (§9, line 314) — a crash between them makes resume redo finished work; (4) batch sub-agent execution triggers only at >~8 tasks, leaving most features inline; (5) the delivery chain (`implementation-delivery.md`) has no gate requiring `.specs/` artifacts committed before `gh pr create`; (6) `verification-agent` charter pins `model_tier: standard`, violating the user's rule that verification subagents always use the heaviest models; (7) `lessons.py` `_norm` (line 185) strips non-ASCII, breaking Unicode dedup upstream already fixed.

## Out of Scope

- `design.md`, `code-analysis.md`, `context-limits.md`, `lessons.md` (stub + top-level owner): massa-ai is a verified superset of TLC 3.3.0 in all four — no sync.
- TLC's flat `.specs/STATE.md` single-file layout: massa-ai's `.specs/project/` split + `HANDOFF.md` + `FEATURES.json` is intentional architecture; never imported.
- TLC's 3-step Requirement Closure Gate collapse: massa-ai's 6-step gate stays.
- Auto-batch (announce-only), parallel disjoint batches, read-only fan-out codification: declined by user 2026-08-04.
- Reinstalling updated skills into `~/.claude` / host configs (post-merge `bun run install:skills` step, user-run).
- Any change to `packages/`, `apps/*/src`, or product runtime code. Regenerated plugin bundles under `apps/<host>-plugin/skills/` and `agents/` are generator output, not hand edits.

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Validator scripts live in `skills/massa-ai/scripts/` beside `lessons.py` | Yes | Generator copies `skills/massa-ai/**` to all 4 host bundles (`generate-skill-artifacts.ts:14`); one source, four surfaces | Yes (source read) |
| TLC validators are template-compatible with massa-ai artifacts | Yes, with path adaptation (`.specs/features/<slug>/`, `--root`) | Agent 3 verified section headings, AC regex, ID regex, phase/task field regexes against massa-ai templates; `validate_state.py` quirk exists upstream too | Yes (agent-verified; discrimination check re-runs at Execute) |
| Batching trigger ">3 tasks" means the offer fires for any formal `tasks.md` with 4+ tasks, even when it fits one batch (single worker offered) | Yes | User picked ">3" over recommended ">5"; batch budget stays ~7/worker | User answer 2026-08-04 |
| "Heaviest model" for verification = `model_tier: deep` in charter | Yes | `model-profiles.json` tiers are `light/standard/deep`; charters own per-agent tier | Yes (source read) |
| PR-gate script checks both porcelain-clean `.specs/` and feature artifacts tracked on the branch | Yes | Either check alone passes trivially (untracked file is porcelain-dirty but absence is porcelain-clean) | Design refines |
| EARS adoption does not break design/tasks templates | Likely — they do not hard-code AC format | Agent 1 flagged for a discrimination check during Design | Design verifies |

Open questions: none — all gray areas resolved with the user on 2026-08-04.

## User Stories

- As the repo owner, I want structural gates enforced by scripts, not memory, so a forgotten step fails loudly instead of drifting silently.
- As the orchestrating agent, I want batch workers offered at >3 tasks so Execute stops consuming main-window context on medium features.
- As a PR reviewer, I want every PR to already carry its `.specs/` spec/state/handoff commits so review reads contract-first and state files never lag the code.
- As the user, I want verification subagents pinned to the deepest model tier so validation quality never silently downgrades.

## Requirements

### Group A — TLC 3.3.0 sync

**SYNC-01 — Validator scripts.** Port `validate_spec.py`, `validate_tasks.py`, `validate_state.py`, `check_commit.py` into `skills/massa-ai/scripts/`, adapted to massa-ai paths (`.specs/features/<slug>/`, `--root` convention matching `lessons.py`), preserving exit semantics (0 pass / 1 violation / 2 usage).

**Acceptance Criteria**:
1. WHEN `python3 skills/massa-ai/scripts/validate_spec.py <feature>` runs against a filled massa-ai `spec.md`, THEN the script SHALL exit 0, and SHALL exit 1 when a required section is missing or an AC lacks SHALL.
2. WHEN `validate_tasks.py` runs against a `tasks.md` whose task lacks a `Gate` field or depends on a later phase, THEN it SHALL exit 1 naming the task.
3. WHEN `check_commit.py --message` receives a non-Conventional-Commit header, THEN it SHALL exit 1; a valid `[KEY] type(scope): subject` massa-ai-style prefixed header SHALL pass.
4. WHEN `validate_state.py <feature>` runs with a missing, FAIL, placeholder, or evidence-free `validation.md`, THEN it SHALL exit 1.

**SYNC-02 — Gate wiring.** Wire the four validators into the workflow prose: `specify.md` closure gate, `tasks.md` pre-approval, `execute.md` commit step + Done line, `validate.md` step 9, `sub-agents.md` standalone fallback, `workflows/spec-driven.md`.

**Acceptance Criteria**:
1. WHEN any of the six files describes its structural gate, THEN it SHALL name the exact `python3 skills/massa-ai/scripts/<script>.py` invocation and state that non-zero exit blocks progression ("run it, do not eyeball it").
2. WHEN no code-execution tool is available, THEN the prose SHALL direct performing the same checks by reading the artifact (graceful degradation preserved).

**SYNC-03 — Git-stash ban + isolation baseline.** In `validate.md` and `sub-agents.md`: forbid `git stash`/`git stash pop` for the discrimination sensor (temp `git worktree` preferred, temp file copies fallback); capture `git status --porcelain` before sensor work and re-verify it matches after cleanup; a mismatch invalidates the run.

**Acceptance Criteria**:
1. WHEN the discrimination sensor is described in either file, THEN `git stash` SHALL appear only as an explicitly forbidden mechanism with the recorded failure mode, and the porcelain baseline capture + post-cleanup match SHALL be required steps.

**SYNC-04 — Status-before-commit.** Reorder `execute.md`: close the task record in `tasks.md` (and spec traceability when used) **before** creating the commit, and include those updates in the same commit; update Tips accordingly.

**Acceptance Criteria**:
1. WHEN a task completes, THEN the prose SHALL require `tasks.md` status + code in one atomic commit, and SHALL state the crash-between-steps resume rationale.

**SYNC-05 — Blast-radius rule.** Add to `execute.md` scope guardrail (and `workflows/spec-driven.md` Execution Contract): approving a spec or tasks authorizes local implementation and local commits only; `git push`, force-push, deploy, production DB changes, and other remote/externally-visible/destructive operations require an explicit go-ahead.

**Acceptance Criteria**:
1. WHEN Execute is approved, THEN the contract SHALL still require explicit user go-ahead before the first push of the branch (delivery chain Stage 3 gains this precondition).

**SYNC-06 — EARS notation.** Adopt the 6-pattern EARS taxonomy in `specify.md` (patterns, template AC examples with pattern comments, edge-case reframing, "EARS is code" tip, closure-gate precondition `validate_spec.py` exits clean).

**Acceptance Criteria**:
1. WHEN a spec's ACs are authored, THEN each SHALL use one of the six EARS shapes and contain SHALL; `validate_spec.py` SHALL enforce the SHALL check deterministically.
2. WHEN Design/Tasks templates reference ACs, THEN no template SHALL contradict EARS (ripple check recorded in `design.md` of this feature).

**SYNC-07 — Discuss pace system.** Port Quick/Guided/Detailed pace selection into `discuss.md`: Guided default with ≤2 independent questions per turn (replaces "3-4 questions"), exactly 1 for dependent decisions, lead-with-recommended-answer rule, "resolve anything discoverable from code yourself" rule, mid-discussion pace switches honored. Preserve massa-ai's Trigger Signals, Output capture list, Confirmation Gate, Closure sections.

**Acceptance Criteria**:
1. WHEN Discuss runs in Guided pace, THEN the prose SHALL cap independent questions at 2 per turn and forbid 3+ question dumps.

**SYNC-08 — Writing Voice.** Port TLC's Writing Voice section into `coding-principles.md` (lead with verdict, definitive decisions, cut hedging, one idea per sentence, no phase-announcing).

**Acceptance Criteria**:
1. WHEN `coding-principles.md` is read, THEN it SHALL contain the Writing Voice section while retaining massa-ai's extra Rules list.

**SYNC-09 — Resume git-reconciliation.** Port TLC's resume procedure into `memory.md`: treat the Handoff snapshot as hypothesis; reconcile against `git branch`, `git status --porcelain`, recent commits, and `tasks.md`; evidence wins over the snapshot. Keep massa-ai's two-file layout and STATE Precedence Chain.

**Acceptance Criteria**:
1. WHEN resuming from `.specs/HANDOFF.md`, THEN the procedure SHALL require the git reconciliation before proposing the next step.

**SYNC-10 — lessons.py Unicode fix.** Replace `_norm`'s ASCII-only regex with TLC's NFD-normalize + combining-mark-strip + `isalnum()/isspace()` implementation; add the `selftest` subcommand (diacritic-collapse + distinct-Japanese-non-collision regression checks). All massa-ai-only features (observe/export/import, dual-write, confidence, context tags) preserved.

**Acceptance Criteria**:
1. WHEN `selftest` runs, THEN it SHALL exit 0, and two lessons differing only by diacritics SHALL produce one dedup key while distinct non-Latin lessons SHALL not collide.

**SYNC-11 — Model-tier rubric + verifier pin.** Adapt TLC's model-tier-per-role rubric into `sub-agents.md`, expressed against massa-ai's real mechanism (charter `metadata.model_tier` + `skills/model-profiles.json`), keeping "size up when unsure". Per user rule, verification subagents always use the heaviest models: change `skills/agents/verification-agent/SKILL.md` `model_tier: standard → deep` and state the pin in the rubric ("the Verifier always runs on the deepest tier").

**Acceptance Criteria**:
1. WHEN subagent artifacts are regenerated, THEN every host's verification-agent artifact SHALL resolve to the profile's `deep` tier and `scripts/__tests__/subagent-parity.test.ts` SHALL pass.
2. WHEN the rubric is read, THEN it SHALL reference `model-profiles.json`/charter tiers, not a free-floating table.

**SYNC-12 — Validation template verdict line.** Tighten the persisted `validation.md` template so the Summary carries a literal `**Result**: PASS` / `**Result**: FAIL` line that `validate_state.py` matches robustly.

**Acceptance Criteria**:
1. WHEN a Verifier writes `validation.md` from the template, THEN `validate_state.py` SHALL detect the verdict from the Summary line without relying on the sensor sub-line.

**SYNC-13 — Small ports.** In `specify.md`: "facts you look up; decisions you ask" rule. In `tasks.md`: linter/formatter command capture in Step 1.5 (Build gate runs it beside tests); generalize the agent-convention-file list to "AGENTS.md (vendor-neutral standard) plus any tool-specific rules file".

**Acceptance Criteria**:
1. WHEN each named file is read, THEN each addition SHALL be present with massa-ai's surrounding sections intact.

### Group B — Batching increase

**BATCH-01 — Trigger at >3 tasks.** Lower the batch sub-agent offer trigger from >~8 to **>3 tasks** everywhere it is stated: `references/spec-driven/sub-agents.md` (trigger + algorithm step 2), `workflows/spec-driven.md` (Auto-Sizing note + Execute step), `references/spec-driven/execute.md` and `tasks.md` where the threshold is mentioned. A 4+-task feature that fits one batch is offered as a single batch worker. Batch budget stays ~7 tasks/worker; offer-then-confirm retained; sequential execution retained.

**Acceptance Criteria**:
1. WHEN a formal `tasks.md` holds 4 or more tasks, THEN the sub-agent offer SHALL fire before Execute starts.
2. WHEN the repo is swept for the old threshold, THEN zero live prose SHALL still state ">~8" as the offer trigger (scripted sweep, population printed beside the verdict).

### Group C — Deliver-.specs-before-PR gate

**GATE-01 — Delivery-chain stage.** Add a stage to `implementation-delivery.md` between Push and Propose: all feature `.specs/` artifacts (`spec/context/design/tasks/validation` as applicable), `.specs/project/STATE.md`, `.specs/HANDOFF.md`, and `.specs/project/FEATURES.json` are updated and committed on the branch before `gh pr create`.

**Acceptance Criteria**:
1. WHEN the chain table is read, THEN the new stage SHALL appear with its command and failure behavior, and Stage "Propose" SHALL name the gate as a precondition.

**GATE-02 — Deterministic check.** New script `skills/massa-ai/scripts/check_specs_delivered.py <feature> [--root .]`: exits 1 unless (a) `git status --porcelain -- .specs/` is empty (nothing uncommitted or untracked under `.specs/`), and (b) the feature's `spec.md` plus `STATE.md`/`HANDOFF.md`/`FEATURES.json` are tracked and their latest content is reachable on the current branch. Wired into the new delivery stage and `workflows/spec-driven.md` step 7.

**Acceptance Criteria**:
1. WHEN any `.specs/` file is modified-but-uncommitted or untracked, THEN the script SHALL exit 1 naming the paths.
2. WHEN all artifacts are committed on the branch, THEN it SHALL exit 0 printing the checked population (count + paths).

**GATE-03 — Workflow step ordering.** Reword `workflows/spec-driven.md` step 7: STATE.md/HANDOFF.md/FEATURES.json updates are written **and committed** before the delivery chain's Propose stage, not "after meaningful progress" alone; reference the GATE-02 script.

**Acceptance Criteria**:
1. WHEN the workflow reaches PR creation, THEN the prose SHALL require the GATE-02 gate green first.

### Group E — ALL-workflows rules (user amendment 2026-08-04, post-PR#64-green)

**ALLWF-01 — Verify, don't assume; documentation is a lead, not truth.** Single-sourced in the router's Core Contract (`skills/massa-ai/SKILL.md`, loaded by every workflow): every factual claim that drives a decision is verified against current codebase/command evidence or confirmed with the user; documentation of any kind — README, docs/, inline comments, external summaries, even `.specs` prose — is a lead to verify against current source, never a trustable source of truth by itself; unverifiable claims become explicit assumptions the user confirms or accepts. Reword the Knowledge Verification Chain's "Project docs" step at its 4 sites (`workflows/spec-driven.md:154`, `workflows/exploration.md:25`, `references/spec-driven/design.md:47,113`) to carry the leads-not-truth framing.

**Acceptance Criteria**:
1. WHEN any workflow is routed, THEN the Core Contract SHALL state the verify-don't-assume rule and the documentation-is-a-lead rule once, and no KVC site SHALL present docs as a trusted step without the verify-against-source qualifier.

**ALLWF-02 — In doubt, ask the user.** Core Contract rule: when genuine doubt remains after looking it up — requirement meaning, scope boundaries, destructive/irreversible choices, contradictory evidence — ask the user instead of picking silently; facts are looked up, decisions are asked (consistent with the SYNC-07 pace rules).

**Acceptance Criteria**:
1. WHEN the Core Contract is read, THEN it SHALL contain the ask-when-in-doubt rule with the facts-vs-decisions boundary.

**ALLWF-03 — Read-only and verification subagents always use the heaviest tier.** All read-only specialist charters pin `model_tier: deep`: bump the 8 currently below it (audit-specialist, context-curator, furps-analyst, investigator, mobile-specialist, navigator, requirements-analyst, reviewer); architecture-specialist, judge, meta-judge, plan-critic, planner, verification-agent already `deep`. Write-capable agents (builder, documentation-agent, test-engineer) unchanged. Extend the D5 rubric in `sub-agents.md`: read-only specialists always run `deep`. Regenerate both artifact sets; parity allowlist + `FEATURES.md` tier table record the 8 authorized changes.

**Acceptance Criteria**:
1. WHEN charters are swept, THEN every read-only specialist SHALL carry `model_tier: deep` (population: 14 of 17 charters), both parity suites SHALL pass, and both `--check` gates SHALL be clean.

### Group F — Python→TypeScript migration spec (authoring only)

**PYTS-01 — New feature spec.** Author `.specs/features/python-to-typescript-scripts/spec.md` (Specify phase only; implementation is a future feature) covering migration of all 8 real Python scripts to TypeScript under Bun: the 6 skill scripts (`lessons`, `validate_spec`, `validate_tasks`, `validate_state`, `check_commit`, `check_specs_delivered`) and the 2 repo scripts (`scripts/synapse-bench-analyze-v2.py`, `scripts/update-fixture-hashes.py`); the polyglot parser fixture `indent-method.py` is excluded (test data, not a script). Register the feature in `.specs/project/FEATURES.json` as planned.

**Acceptance Criteria**:
1. WHEN the new spec is read, THEN it SHALL enumerate the 8-script population with per-script invocation-surface evidence, name the wiring ripple (every `python3` invocation in skill prose + tests + this feature's validators), and close with requirement IDs and testable ACs; FEATURES.json SHALL list the feature as planned.

### Group D — Cross-cutting

**GEN-01 — Regeneration + parity.** After all `skills/` edits: run `bun run scripts/generate-skill-artifacts.ts` and `scripts/generate-subagent-artifacts.ts`; `--check` drift gates and `skill-artifact-parity` + `subagent-parity` tests pass.

**Acceptance Criteria**:
1. WHEN `bun run test:scripts` runs after regeneration, THEN both parity suites SHALL pass and `--check` SHALL report zero drift.

**GEN-02 — Discriminating tests for new scripts.** Each new/changed script gets tests satisfying CONTRIBUTING step 7 (happy + violation + edge paths; mutation-style review), runnable from `bun run test:scripts` (shell or bun-driven invocation of the Python scripts) without requiring PostgreSQL/Ollama.

**Acceptance Criteria**:
1. WHEN a validator's core check is inverted (mutation), THEN at least one test SHALL fail.
2. WHEN a future edit to the template blocks in `specify.md`/`tasks.md`/`validate.md` breaks a validator's structural expectations, THEN a template-conformance test in `test:scripts` SHALL fail (Plan Challenge C5 closure).

**GEN-03 — CHANGELOG.** Entry under `## [Unreleased]` `### Changed` (minor bump on merge).

**Acceptance Criteria**:
1. WHEN the PR is opened, THEN `CHANGELOG.md` SHALL contain the entry (CI merge gate).

## Requirement Traceability

| ID | Files touched |
|---|---|
| SYNC-01 | `skills/massa-ai/scripts/{validate_spec,validate_tasks,validate_state,check_commit}.py` (new) |
| SYNC-02 | `references/spec-driven/{specify,tasks,execute,validate,sub-agents}.md`, `workflows/spec-driven.md` |
| SYNC-03 | `references/spec-driven/{validate,sub-agents}.md` |
| SYNC-04 | `references/spec-driven/execute.md`, `workflows/spec-driven.md` |
| SYNC-05 | `references/spec-driven/execute.md`, `workflows/spec-driven.md` |
| SYNC-06 | `references/spec-driven/specify.md` |
| SYNC-13 | `references/spec-driven/{specify,tasks}.md` |
| SYNC-07 | `references/spec-driven/discuss.md` |
| SYNC-08 | `references/spec-driven/coding-principles.md` |
| SYNC-09 | `references/spec-driven/memory.md` |
| SYNC-10 | `skills/massa-ai/scripts/lessons.py` |
| SYNC-11 | `references/spec-driven/sub-agents.md`, `skills/agents/verification-agent/SKILL.md`, regenerated `apps/*-plugin/agents/*` |
| SYNC-12 | `references/spec-driven/validate.md` (template block) |
| BATCH-01 | `references/spec-driven/{sub-agents,execute,tasks}.md`, `workflows/spec-driven.md` |
| GATE-01 | `references/implementation-delivery.md` |
| GATE-02 | `skills/massa-ai/scripts/check_specs_delivered.py` (new), `workflows/spec-driven.md` |
| GATE-03 | `workflows/spec-driven.md` |
| ALLWF-01 | `skills/massa-ai/SKILL.md`, KVC sites in `workflows/{spec-driven,exploration}.md` + `references/spec-driven/design.md` |
| ALLWF-02 | `skills/massa-ai/SKILL.md` |
| ALLWF-03 | 8 read-only charters under `skills/agents/`, `references/spec-driven/sub-agents.md`, regenerated bundles |
| PYTS-01 | `.specs/features/python-to-typescript-scripts/spec.md` (new), `.specs/project/FEATURES.json` |
| GEN-01 | regenerated `apps/{claude,codex,cursor,opencode}-plugin/skills/**`, `agents/**` |
| GEN-02 | new test files under `scripts/tests/` or `scripts/__tests__/` (Design decides) |
| GEN-03 | `CHANGELOG.md` |

## Edge Cases

- Validator run in a repo with multiple in-flight features: auto-detect must error listing candidates, never guess (TLC behavior preserved).
- `check_specs_delivered.py` on a branch whose `.specs/` is clean because the artifacts were never written: absence must fail (tracked-on-branch check), not pass porcelain-clean.
- `check_commit.py` must accept massa-ai's `[JIRA-KEY] ` subject prefix (massa-ai `commit.md` contract) — upstream regex may not; adapt.
- Fresh worktree provisioning: `bun install` can silently skip native grammars (documented); parity tests don't need them, but `test:scripts` full run does — use the documented addon-copy repair.
- Generated bundles: hand-editing `apps/*-plugin/skills/**` is forbidden; only regeneration.

## Evidence (verification basis)

In-session re-measurements (2026-08-04, `/usr/bin/grep`, worktree base `066e86e`): `git stash` at `validate.md:104` + `sub-agents.md:124`; zero repo-wide references to any of the four validator scripts; `_norm` ASCII regex at `lessons.py:185`; `execute.md` §7 (line 229) precedes §9 (line 314); `verification-agent/SKILL.md:8 model_tier: standard`; `generate-skill-artifacts.ts:14` copies `skills/massa-ai/**`; TLC `SKILL.md metadata.version: 3.3.0`. Comparison-agent reports are leads confirmed on these anchors; remaining per-line claims re-verified task-by-task at Execute.
