---
name: bugs-fix
description: "Executes fixes from a saved bugs audit report; not for findings-only discovery, single known issues without a report, or broad product changes."
license: MIT
metadata:
  version: "1.2.0"
---

### Bugs Fix

Execute fixes from a bugs audit markdown report only.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate — its Stage 3 delivery-authorization scope covers one go-ahead through PR creation; force-push/deploy/merge stay separately gated) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

**Isolation Gate — before the first file edit:** execute `references/implementation-delivery.md` Stage 0–1 now (fetch base, create the worktree + branch, work inside it) and record the worktree path + branch — or one of Stage 1's two legal skip reasons, verbatim — before any repository mutation.

Not for findings-only bug discovery — route to `workflows/bugs/bugs-audit.md`. Not for one known broken behavior without an audit report — route to `workflows/debug.md`. Not for broad product/design changes — route to `workflows/spec-driven.md`.

1. Resolve/reuse `workflowSessionId`: `bugs-fix-[entity]`
2. Load shared references:
   - `references/audit-report-io.md` before any code or test change
   - `references/lessons.md` to load confirmed project lessons
   - `references/codebase-investigation.md` before changing unfamiliar bug paths
   - `references/verification-ladder.md` before non-trivial edits
   - `references/context-firewall.md` before inspecting large diffs, logs, snapshots, generated reports, or broad search output
   - `references/agent-orchestration.md` only for large/high-risk findings, disjoint implementation slices, or independent verification
   - `references/discrimination-sensor.md` before closing any finding under the Mandatory Verification Fix Gate
   - `references/knowledge-verification-chain.md` when the bug's root cause depends on an external library's or API's actual behavior
   - `references/brownfield-mapping.md` (Minimum Bar only, Standard+ bug findings) when recall returns no hit for the bug's target and no gate command can be derived from the report's evidence
3. `recall` -> load prior bug patterns, known regressions, fragile flows, accepted exceptions, testing conventions, and reusable verification recipes for the report target.
4. Select the bugs audit report with execution focus:
   - Establish the report selector, target focus, and optional finding selector before selecting a report. Target focus can be a flow, module, files/globs, branch comparison, commit range, symbol/class/function, feature area, or explicit whole-repo target.
   - If the user gives a path, read that exact markdown file.
   - If the user asks for "latest" or gives no path, require a concrete target focus first; do not run the latest bugs report against an unspecified target.
   - Select the latest `audits/bugs/<YYYY-MM-DD bugs-audit>.md` only after target focus is known, using `references/audit-report-io.md`.
   - Stop if no report exists; do not infer findings from conversation history.
   - Validate the report deterministically: `bun skills/massa-ai/scripts/validate_audit_report.ts <path> --family bugs` (`references/audit-report-io.md`, Deterministic Validation); non-zero exit blocks editing. Also confirm resolved files or material scope evidence and current file/line evidence; stop on stale, target-drifted, or ambiguous reports.
5. Extract actionable bug findings:
   - Keep findings with concrete `Bug Class`, `Impacted Flow`, `Trigger or Repro Path`, `Root Cause Hypothesis`, `Regression Risk`, `Location`, `Evidence`, `Simplest Fix Direction`, and `Verification Suggestion`.
   - Ignore ruled-out candidates, no-finding sections, and low-confidence hardening ideas unless the user explicitly asks to include them.
   - If the user supplied finding IDs, extract only those IDs after validating they exist and match the current target focus.
   - Rank by severity, trigger likelihood, regression risk, dependency order, and verification cost.
6. Build a bug-fix map before editing:
   - Finding ID -> impacted flow, trigger/repro path, suspected root cause, expected behavior, current behavior, files likely affected, validation assets, and verification command.
   - Group findings only when one small fix addresses the same root cause.
   - Keep unrelated cleanup out of scope.
7. Size each finding with `references/verification-ladder.md`:
   - Quick: local guard, null/state fix, small validation correction, deterministic branch fix, config/default correction, or focused regression test.
   - Standard: multi-file data-flow fix, persistence or async behavior change, public contract correction, migration-adjacent repair, or meaningful test impact; define repro and verification recipe first.
   - Spec-driven: new behavior policy, broad design change, cross-boundary ownership decision, migration strategy, or unclear expected behavior; pause and route to `workflows/spec-driven.md` or ask for approval.
8. Apply bug fixing methods:
   - Reproduce or confirm the trigger first when feasible; otherwise prove the root-cause path from current source evidence.
   - Trace input -> transformation -> output and fix the divergence point closest to the root cause.
   - Preserve existing public contracts unless the report explicitly identifies them as the bug.
   - Prefer the smallest behavior-preserving fix: guard, validation, state update, ordering, await/async correction, persistence constraint, config default, or call-site contract alignment.
   - Add or update regression tests for the trigger path when feasible; include positive coverage so the fix does not over-block valid behavior.
   - Do not weaken tests, fixtures, snapshots, types, or public contracts to make the fix pass.
9. Use agent orchestration only when it improves signal, except independent verification of the bug fix, which is mandated at the tiers named in `references/agent-orchestration.md`'s Independent Verification Exception. Dispatch per `references/agent-orchestration.md`:

> **Dispatch: `massa-ai-builder`** (role: `builder`) — charter `skills/agents/builder/SKILL.md`
> - trigger: large/high-risk finding, disjoint implementation slice, or explicit subagent request
> - scope: one isolated bug finding with a disjoint write set
> - permissions: write (disjoint write set)
> - inputs: the finding ID, repro path, root cause, and simplest fix direction
> - sensors: report's verification suggestion or equivalent deterministic command; repro path must fail before fix and pass after
> - output: implementation summary, commands run, test counts, deviations
> - firewall: raw diffs/logs summarized
> - memory: suggest-only; main agent persists reusable bug patterns
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

> **Dispatch: `massa-ai-reviewer`** (role: `reviewer`) — charter `skills/agents/reviewer/SKILL.md`
> - trigger: implementation complete, before the verification gate — never optional
> - scope: the fix's diff surface and its task/AC context
> - permissions: read-only
> - inputs: diff, acceptance context, recalled code-quality conventions
> - sensors: bugs, regressions, missing edge cases, smells introduced by the diff
> - output: ranked findings, blocking vs advisory; blocking findings become fix items before verification runs
> - firewall: summarized findings only, never raw diff dumps
> - memory: suggest-only; main agent persists
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes review against this output contract and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

> **Dispatch: `massa-ai-verification-agent`** (role: `verification-agent`) — charter `skills/agents/verification-agent/SKILL.md`
> - trigger: mandatory at Standard+/Spec-driven bug-fix size or high/critical bug severity, per the Independent Verification Mandate tier gate in `references/verification-ladder.md`
> - scope: the fixed bug finding's repro path, regression tests, and report claim closure
> - permissions: read-only
> - inputs: the bug finding, the applied root-cause fix, the verification suggestion, and validation assets
> - sensors: deterministic command (repro path, focused regression tests, inspection) and report claim closure; discrimination sensor per `references/discrimination-sensor.md` (the divergence-point fix just applied)
> - output: confirmed/disproven bug-closure verdict with evidence
> - firewall: raw repro transcripts and test/log output summarized
> - memory: suggest-only; main agent persists bug-closure verification outcomes
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes re-check of the bug-fix closure evidence against this output contract and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed
   - Main agent owns report parsing, prioritization, memory writes, final synthesis, and Evidence Gate.

10. Verify each completed finding:
   - If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
     `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
   - Apply the Mandatory Verification Fix Gate from `references/verification-ladder.md`: run the report's Verification Suggestion or an equivalent deterministic command/artifact check for each selected finding or coherent group.
   - A finding cannot be marked `fixed` when a target-relevant command or artifact check exists but was not attempted; if verification cannot run, mark it `blocked`, `deferred`, or `skipped` with an allowed skipped-check reason.
   - Run the report's verification suggestion when available.
   - The red→green reproduction proves the regression test catches this bug; the discrimination sensor proves that same assertion would also discriminate against a future wrong implementation — complementary, and both required at Standard+.
   - At the tiers named in the verification-agent dispatch's trigger above, run the discrimination sensor per `references/discrimination-sensor.md` against the divergence-point fix; a surviving mutant marks the finding's closure row `blocked` and records the `surviving_mutant` lessons signal even when the reproduction test is green.
   - The fix→re-verify cycle is capped per `references/verification-ladder.md`'s Bounded Fix→Re-verify Loop; this is a separate counter from the two-consecutive-failed-fixes breaker into `references/root-cause-scripts.md` above, which fires inside one iteration and neither consumes nor resets the loop count.
   - Run focused regression tests first, then relevant lint/type/build/test commands when feasible.
   - Confirm validation assets were not weakened.
   - Record command/artifact, result, skipped reason or `none`, highest Verification Ladder level reached, validation assets protected, and residual risk.
11. At completion, persist only durable knowledge:
   - Root causes, fragile project-specific flows, accepted exceptions, or reusable regression-test recipes after scoring with the Importance Calibration System.
   - Use required tags: `project:<projectId>`, `session:<workflowSessionId>`, `workflow:bugs-fix`, `entity:<entity>`, and one `memory:<tier>` tag.
12. Write the Fix Closure Report per `references/audit-report-io.md`'s Fix Closure Report Contract (`audits/bugs/<YYYY-MM-DD bugs-fix-closure>.md`), then run `bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family bugs` before Propose and the Evidence Gate — a non-zero exit blocks both. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).
13. Complete the Evidence Gate from `references/evidence-gate.md`.

## Examples

User asks: "Use bugs-fix to fix latest audit findings for checkout persistence."

1. Confirm target focus is `checkout persistence`, then read the latest matching `audits/bugs/* bugs-audit.md`.
2. Validate metadata, target focus, freshness, required fields, and current evidence before editing.
3. Confirm each trigger or root-cause path.
4. Fix the smallest root-cause divergence and add regression coverage when feasible.
5. Run focused verification and report skipped broader checks.

User asks: "Fix BUG-2 from audits/bugs/2026-06-07 bugs-audit.md."

1. Read the specified report and only execute `BUG-2`.
2. Preserve other bug findings for later.
3. Report evidence for `BUG-2` closure and residual risks.

<!-- validator anchors: "Independent Verification Exception", "the divergence-point fix just applied", "audits/bugs/<YYYY-MM-DD bugs-fix-closure>.md", "check_fix_closure.ts <closure.md> --family bugs", "The red→green reproduction proves the regression test catches this bug", "Bounded Fix→Re-verify Loop" -->

