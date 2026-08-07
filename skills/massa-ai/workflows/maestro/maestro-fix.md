---
name: maestro-fix
description: "Child-only workflow to fix confirmed MST-prefixed findings from a saved Maestro audit report or an explicit maestro-audit handoff."
license: MIT
metadata:
  version: "1.3.0"
---

### Maestro Fix

Child-only workflow: fix confirmed `MST-*` findings from a saved Maestro audit report or an explicit `maestro-audit` handoff.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate) and `references/code-annotation.md` (doc blocks, rationale, test coverage) — one user go-ahead carries this fix through PR creation only, force-push, deploy, and merge stay separately gated, and Maestro Cloud execution/upload is gated again, separately, per `references/maestro/cloud.md`. After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

**Isolation Gate — before the first file edit:** execute `references/implementation-delivery.md` Stage 0–1 now (fetch base, create the worktree + branch, work inside it) and record the worktree path + branch — or one of Stage 1's two legal skip reasons, verbatim — before any repository mutation.

Reject direct use without a saved `audits/maestro/<YYYY-MM-DD maestro-audit.md>` report or a parent audit handoff that includes the same required metadata. Do not execute from chat summaries, remembered findings, inline comments, or unsaved model analysis. The saved report or parent handoff is the source of truth.
**Reuse Scan — before writing new implementation code:** run the mandatory reuse scan per `references/code-reuse-scan.md` (separate read-only subagents; the reuse map's use/extend/new decisions are consumed before new code is planned or written) — or record its inline-fallback reason, verbatim.


1. Resolve/reuse `workflowSessionId`: `maestro-fix-[entity]`.
2. Load shared references:
   - `references/maestro.md` as the index before choosing focused Maestro references.
   - `references/maestro/fact-ledger.md` before making any Maestro claim; tag facts as `official-doc`, `live-help`, `repo-convention`, or `excluded/unverified`.
   - `references/maestro/cli-device.md` before CLI checks, device/platform readiness, local sharding, or executable runs.
   - `references/maestro/artifacts-reports.md` before report/artifact/debug-output, screenshot, video, recording, or AI report claims.
   - `references/maestro/patterns.md` before applying flow, setup/teardown, fixture, validation asset, or skipped-check rules.
   - `references/discrimination-sensor.md` before closing any finding `fixed` — the Maestro instantiation is `references/maestro/patterns.md` § Discrimination Sensor (Flow Mutation), a scratch-copy selector/assertion perturbation.
   - `references/brownfield-mapping.md` (Minimum Bar only — `CONCERNS.md` and `TESTING.md`) when recall returns no hit for the target flow/workspace and no gate command is derivable from the report's evidence, for Standard+ findings.
   - `references/maestro/yaml-commands.md` before changing unfamiliar command syntax.
   - `references/maestro/selectors.md` before changing selector strategy.
   - `references/maestro/workspace-execution.md` before changing config, tags, execution order, sharding, or CI command shape, or on the first fix touching an unmapped Maestro workspace.
   - `references/maestro/config-env-output.md` before changing env, properties, report-output flags, or artifact directories.
   - `references/maestro/js-scripting.md` before changing JavaScript helpers or logs.
   - `references/maestro/cloud.md` only when saved finding scopes Cloud execution or Cloud artifact evidence.
   - `references/maestro/mcp.md` only when saved finding scopes Maestro MCP or Viewer evidence.
   - `references/audit-report-io.md` before report validation or source edits.
   - `references/lessons.md` to load confirmed project lessons
   - `references/mobile-context.md` for platform scope, parity, and device/emulator assumptions.
   - `references/codebase-investigation.md` before changing unfamiliar flows, fixtures, setup/teardown, or CI wiring.
   - `references/verification-ladder.md` before non-trivial edits.
   - `references/context-firewall.md` before large reports, logs, screenshots, videos, JUnit XML, or generated artifacts.
   - `references/naming-standards.md` before naming flows, tags, fixtures, selectors, or test data.
3. Select and validate the report:
   - Prefer an exact report path plus optional `MST-*` IDs.
   - For `latest` or omitted path, require a concrete target focus, then select only from `audits/maestro/`.
   - Validate metadata deterministically: `bun skills/massa-ai/scripts/validate_audit_report.ts <path> --family maestro` (`references/audit-report-io.md`, Deterministic Validation); non-zero exit blocks editing. Also confirm flow inventory, Maestro run matrix, JUnit report/artifact evidence, Verification/Test Fidelity Checklist, and Execution Handoff are present.
   - Stop on invalid, stale, target-drifted, or ambiguous reports.
4. Extract actionable findings:
   - Keep only selected `MST-*` findings with concrete location, scenario source, evidence, impacted journey, flake or coverage risk, simplest sufficient fix, and Verification Suggestion.
   - Ignore no-finding claims, ruled-out candidates, skipped checks, and low-confidence ideas unless the user explicitly changes scope after revalidation.
5. Revalidate current source and report drift:
   - Reinspect current flow/subflow/fixture/setup files and current CI command shape.
   - Confirm evidence still applies; stop or re-audit if files, flow paths, target, app behavior, or expected behavior have drifted.
6. Fix only allowed artifacts:
   - You may edit only Maestro flows, subflows, fixtures, setup/teardown, and test data unless the saved audit finding directly scopes Maestro CI/report wiring.
   - Maestro flows.
   - Subflows.
   - Fixtures.
   - Setup/teardown.
   - Test data.
   - Directly required Maestro CI/report wiring when the audit finding targets it.
7. If evidence points to an app bug, product behavior gap, missing selector/test ID in production code, backend issue, or requirements ambiguity, stop and route to `workflows/debug.md`, `workflows/feature.md`, or `workflows/requirements/requirements-audit.md`. Do not modify production app behavior in this child workflow.
8. Apply fixes using stable-flow design from `references/maestro/patterns.md`:
   - Replace arbitrary sleeps with observable state waits when possible.
   - Replace brittle selectors with stable selectors, accessibility labels, or test IDs already present.
   - Keep setup/teardown explicit, idempotent, and isolated.
   - Protect existing flows, subflows, fixtures, snapshots, baselines, report consumers, and CI commands unless the audit finding explicitly scopes them.

> **Dispatch: `massa-ai-verification-agent`** (role: `verification-agent`) — charter `skills/agents/verification-agent/SKILL.md`
> - trigger: mandatory at Standard+/Spec-driven finding size or high/critical severity per the Independent Verification Mandate in `references/verification-ladder.md`; at Quick size, device runs are expensive, so skip the dispatch and instead run the standalone fresh-eyes self-check named in the fallback line
> - scope: the fixed flow/subflow/fixture's `MST-*` claim closure — selector/assertion changes, stable-flow design compliance, and the JUnit report/artifact evidence for the run
> - permissions: read-only
> - inputs: the `MST-*` finding, the applied flow/fixture diff, the report's Verification Suggestion, the JUnit report path, the artifact directory, and device/platform
> - sensors: the report's Verification Suggestion or equivalent `maestro test` run; flow-mutation discrimination sensor per `references/maestro/patterns.md` (single lightweight selector/assertion perturbation)
> - output: confirmed/disproven closure verdict for the `MST-*` row, with JUnit/artifact evidence cited
> - firewall: JUnit XML, logs, screenshots, and recordings summarized, never dumped raw
> - memory: suggest-only; main agent persists maestro-closure verification outcomes
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes re-check of the MST closure rows and on-disk JUnit/artifact evidence, and record the skipped-delegation reason
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

9. Use strict harness sensors:
   - If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
     `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
   - Apply the Mandatory Verification Fix Gate from `references/verification-ladder.md`: run the report's Verification Suggestion or an equivalent deterministic command/artifact check for each selected `MST-*` finding or coherent group.
   - Prefer repository-specific Maestro commands; otherwise run `maestro test --format junit --output <report.xml> --test-output-dir <artifact-dir> <flow-or-directory>`.
   - A finding cannot be marked `fixed` when a target-relevant command or artifact check exists but was not attempted.
   - If verification cannot run, mark it `blocked`, `deferred`, or `skipped` with an allowed skipped-check reason.
   - At the tier gate that mandated the verifier dispatch above, also run the Discrimination Sensor from `references/verification-ladder.md` via the flow-mutation sensor in `references/maestro/patterns.md`; a surviving mutant on the fixed flow's selector/assertion means the finding's closure row is `blocked`, and record the `surviving_mutant` lessons signal.
   - Cap the fix→re-verify cycle at 3 iterations per `MST-*` finding per `references/verification-ladder.md`'s Bounded Fix→Re-verify Loop; after 3, stop with a `blocked` closure row and ask for direction. This is a verification-cycle counter, distinct from the two-consecutive-failed-fixes edit breaker above that routes to `references/root-cause-scripts.md` — neither resets or consumes the other.
10. Persist the closure matrix as the Fix Closure Report per `references/audit-report-io.md`'s Fix Closure Report Contract, at `audits/maestro/<YYYY-MM-DD maestro-fix-closure>.md`: the standard Closure Matrix columns (`MST-*` ID, status, changed files, command/artifact, result, skipped reason, Discrimination Sensor, Independent Verifier, ladder level, validation assets protected, residual risk, next step) plus the maestro extras `JUnit Report`, `Artifact Directory`, and `Device/Platform`, appended after the standard set. Before the Propose/Evidence Gate, run `bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family maestro`; a non-zero exit blocks closure. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).
11. Persist only durable Maestro fix patterns, flake root causes, selector/test-ID policy, setup/teardown recipes, device matrix constraints, or reusable verification commands after Importance Calibration. Use `workflow:maestro-fix` and required memory tags.
12. Complete the Evidence Gate from `references/evidence-gate.md`.

## Examples

User asks: "Fix MST-2 from audits/maestro/2026-06-29 maestro-audit.md."

1. Read and validate the saved report.
2. Reinspect current flow evidence and fix only the targeted Maestro flow/subflow/fixture surface.
3. Run the report's Verification Suggestion or equivalent Maestro command and report the closure matrix.

<!-- validator anchors: references/discrimination-sensor.md | Discrimination Sensor (Flow Mutation) | references/brownfield-mapping.md (Minimum Bar only) | first fix touching an unmapped Maestro workspace | Independent Verification Mandate | Bounded Fix→Re-verify Loop | surviving_mutant lessons signal | Fix Closure Report Contract | audits/maestro/<YYYY-MM-DD maestro-fix-closure>.md | check_fix_closure.ts --family maestro | graceful degradation preserved -->

