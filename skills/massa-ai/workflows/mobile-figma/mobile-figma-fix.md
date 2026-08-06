---
name: mobile-figma-fix
description: "Fixes confirmed MFM-prefixed findings from a saved mobile Figma audit report; the saved audit report is the source of truth, not screenshots or chat summaries."
license: MIT
metadata:
  version: "1.2.0"
---

### Mobile Figma Fix

Fix confirmed `MFM-*` findings from a saved mobile Figma audit report only.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate — one delivery go-ahead spans through PR creation only, with force-push, deploy, and merge separately gated per that reference's Stage 3/7) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

Do not execute from chat summaries, screenshots alone, remembered findings, or an unsaved comparison table. The saved `audits/mobile-figma/<YYYY-MM-DD mobile-figma-audit>.md` report is the source of truth. Route fresh comparison work to `mobile-figma-audit`.

1. Resolve/reuse `workflowSessionId`: `mobile-figma-fix-[entity]`.
2. Load shared references:
   - `references/mobile-figma-matcher/repository-detection.md` before platform guidance.
   - `references/mobile-figma-matcher/core.md` for Figma, assets, mapping, Maestro, matrix, and claim contracts.
   - `references/figma-pre-analysis.md` when the findings span multiple Figma links or nodes — run its two-stage sequential retrieval protocol for the re-read.
   - `references/lessons.md` to load confirmed project lessons
   - `references/mobile-context.md` for mobile boundary and verification guidance.
   - `references/audit-report-io.md` before any source or validation-asset edit.
   - `references/audit-scope.md` and `references/codebase-investigation.md` for freshness and current source.
   - `references/verification-ladder.md` before edits.
   - `references/context-firewall.md` before large design/runtime artifacts.
   - `references/agent-orchestration.md` for the tier-gated builder/verification-agent dispatch in the fix loop below.
   - `references/discrimination-sensor.md` before closing any finding under the Mandatory Verification Fix Gate — the mobile-Figma token/value instantiation lives in `references/mobile-figma-matcher/core.md`'s Discrimination Sensor for Visual Parity section.
   - `references/knowledge-verification-chain.md` when a selected finding's fix direction depends on platform-API or external-library technique rather than the Figma-defined value.
   - `references/brownfield-mapping.md` (Minimum Bar only — the gate-command packet, `TESTING.md`-equivalent) when recall returns no hit for the target surface/module and no gate command is derivable from the report's evidence, for Standard+ findings; the report's Verification/Test Fidelity Checklist already carries the risk surface, so `CONCERNS.md` is satisfied-by-citation from that checklist rather than derived fresh.
3. `recall` -> load current design-system rules, accepted deviations, prior component mappings, source-set boundaries, accessibility constraints, asset-pipeline rules, and render recipes for the target.
4. Select a report and target focus:
   - Prefer an exact report path plus optional `MFM-*` IDs.
   - For `latest` or omitted path, require a concrete target focus, then select only from `audits/mobile-figma/`.
   - Validate metadata deterministically: `bun skills/massa-ai/scripts/validate_audit_report.ts <path> --family mobile-figma` (`references/audit-report-io.md`, Deterministic Validation); non-zero exit blocks editing. Also stop if no report exists or the report lacks Target Surface Matrix, Figma source/node mappings/timestamp, per-surface platform configurations, capability matrix, or comparison matrix.
   - Reject legacy Android-only reports without the Target Surface Matrix and `Surface ID` fields. Require a fresh audit; do not infer or migrate the missing schema.
5. Validate report freshness before editing:
   - Re-resolve the target files, rebuild the Target Surface Packet, and verify git scope/base/head when relevant.
   - Stop and re-audit when current module/source-set classification no longer matches the report.
   - Re-read the same Figma node/selection and verify its current identity, variants, values, and screenshot. Stop and re-audit if material design drift invalidates findings.
   - Verify every platform configuration is reproducible or explicitly accept a documented substitute.
   - Recheck every selected finding's surface ID, UI stack, source-set/module, source location, resolved token/resource/asset chain, evidence, and constraint rationale.
   - Reject `NOT EVALUATED`, `CONSTRAINT DEVIATION`, unknown, stale, or low-confidence rows as executable findings unless the user explicitly changes scope after re-audit.
6. Load only platform contracts named by the selected findings and current Target Surface Packet. Build a remediation matrix: finding -> surface -> element/state/property -> Figma value -> current implementation value -> shared/platform root change -> affected files -> validation assets -> runtime sensor -> optional Maestro packet -> order -> status.
7. Size work with the Verification Ladder. Route broad design-system migrations, unclear accessibility/product conflicts, or cross-feature component redesign to `spec-driven` before editing.
8. Apply the smallest root fix:
   - Prefer existing shared components, theme tokens, resources, dimensions, typography, shapes, and state definitions before local overrides.
   - Preserve stack-specific accessibility, minimum touch targets, localization, safe areas/insets, adaptive behavior, and native platform conventions.
   - For KMP, apply shared root fixes before platform-local overrides when the cause is shared, then verify every affected platform target.
   - Keep XML/Compose, UIKit/SwiftUI, and KMP/native interoperability explicit. Do not duplicate one visual rule across layers when an established shared source owns it.
   - Do not weaken screenshot tests, previews, fixtures, assertions, test tags, resource IDs, content descriptions, or Maestro selectors to hide a mismatch.
   - Modify tracked Maestro flows only when the selected finding explicitly identifies the flow as incorrect or missing and the user-approved scope includes that change.
9. Dispatch per `references/agent-orchestration.md`; the verification-agent block below is tier-gated mandatory, not merely discretionary — carved out of ordinary delegation gating by that reference's Independent Verification Exception:

> **Dispatch: `massa-ai-builder`** (role: `builder`) — charter `skills/agents/builder/SKILL.md`
> - trigger: a selected `MFM-*` finding spans a disjoint surface or shared-root slice, or an explicit subagent request
> - scope: one `MFM-*` finding, or a coherent surface group sharing one KMP root cause, with a disjoint write set
> - permissions: write (disjoint write set, per-surface or per-module ownership)
> - inputs: the finding's Surface ID, Figma value, resolved token/resource/asset chain, current implementation value, and simplest fix direction
> - sensors: the remediation matrix's assigned runtime sensor and optional Maestro packet for the surface
> - output: implementation summary, changed files, commands run, per-surface render evidence
> - firewall: raw diffs and screenshots summarized
> - memory: suggest-only; main agent persists reusable token/mapping patterns
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
> - trigger: mandatory at Standard+/Spec-driven size or high/critical severity per the Independent Verification Mandate in `references/verification-ladder.md`; a Quick-tier finding runs the fallback fresh-eyes self-check below instead
> - scope: the fixed `MFM-*` finding's surface, resolved token/value, comparison-matrix row, and closure claim
> - permissions: read-only
> - inputs: the finding, the applied fix, the comparison-matrix row, the render sensor used, and validation assets
> - sensors: the token/value mutation sensor per `references/mobile-figma-matcher/core.md`'s Discrimination Sensor for Visual Parity section, plus the surface's existing render/snapshot/instrumentation check
> - output: confirmed/disproven closure verdict with evidence, mutation killed/survived result
> - firewall: raw screenshots and renders summarized
> - memory: suggest-only; main agent persists reusable verification recipes
> - fallback: at Quick tier, or when the subagent is unavailable, run a standalone fresh-eyes re-check of the MFM closure rows and record the skipped-delegation reason in closure evidence
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

10. Verify after each coherent finding group:
    - If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
      `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
    - Apply the Mandatory Verification Fix Gate from `references/verification-ladder.md`: run the report's Verification Suggestion or an equivalent deterministic command/artifact check for each selected `MFM-*` finding or coherent group.
    - A finding cannot be marked `fixed` when a target-relevant command, render sensor, comparison artifact, or Maestro reproduction exists but was not attempted; if verification cannot run, mark it `blocked`, `deferred`, or `skipped` with an allowed skipped-check reason.
    - Re-resolve every affected comparison row, not only the previous mismatch.
    - Run focused static checks and existing preview/screenshot/instrumentation sensors.
    - Re-evaluate every affected surface, including surfaces changed indirectly by a shared KMP fix.
    - When Maestro evidence was used in audit and remains available, reproduce each recorded device/configuration/content state and rerun the same flow or navigation steps; capture equivalent hierarchy and screenshots.
    - If Maestro becomes unavailable, record the regression gap instead of claiming equivalent runtime verification.
    - Run the token/value mutation sensor from `references/mobile-figma-matcher/core.md`'s Discrimination Sensor for Visual Parity section for every critical/high-severity finding and every shared-KMP-root row; a surviving mutant marks that row's closure status `blocked` and records the `surviving_mutant` lessons signal.
    - Cap the fix→re-verify cycle at 3 iterations per `MFM-*` finding per `references/verification-ladder.md`'s Bounded Fix→Re-verify Loop; after 3, stop with a `blocked` closure row and ask for direction. This is a verification-cycle counter, distinct from the two-consecutive-failed-fixes edit breaker in the preamble above that routes to `references/root-cause-scripts.md` — neither resets nor consumes the other.
11. Rebuild the final comparison matrix using fresh Figma and per-surface implementation evidence. Completion requires zero unresolved selected mismatches; all newly `NOT EVALUATED` rows remain residual risk. A passing Maestro flow does not change an unmatched visual row to `MATCH`.
12. Produce a closure matrix with `MFM-*` ID, surface ID, status (`fixed`, `deferred`, `blocked`, `skipped`), changed files, final Figma/implementation values, command/artifact, result, skipped reason or `none`, highest Verification Ladder level reached, validation assets protected, static evidence, per-platform render evidence, optional Maestro evidence, and residual risk.
13. Write the Fix Closure Report per `references/audit-report-io.md`'s Fix Closure Report Contract at `audits/mobile-figma/<YYYY-MM-DD mobile-figma-fix-closure>.md`, sibling of the consumed audit report — the standard Closure Matrix columns, appending the mobile-figma extras (`JUnit Report`, `Artifact Directory`, `Device/Platform`) whenever Maestro or instrumentation runtime evidence backs a row. Run `bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family mobile-figma` before Propose or the Evidence Gate; a non-zero exit blocks closure. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).
14. Persist only durable token mappings, source-set ownership rules, approved constraint deviations, component reuse rules, asset-pipeline rules, or reusable verification recipes after Importance Calibration. Use `workflow:mobile-figma-fix` and required tags.
15. Complete `references/evidence-gate.md` and report the highest Verification Ladder level reached.

## Examples

User asks: "Fix MFM-1 and MFM-3 from the latest LoginScreen mobile Figma audit."

1. Select the latest report matching LoginScreen and validate the Figma node, reported target surfaces, and both findings.
2. Fix shared theme/component causes before screen-local overrides.
3. Rebuild every affected matrix row and rerun the strongest existing runtime sensors.

User asks: "Apply the checkout mobile Figma report and verify with Maestro."

1. Verify the report used Maestro and that the same safe device/flow remains available.
2. Apply confirmed fixes, rerun the recorded flow, capture equivalent hierarchy/screenshots, and keep visual parity conclusions separate from flow success.

User asks: "Fix the shared KMP spacing finding and its iOS host mismatch."

1. Re-detect the common Compose and iOS host surfaces, load KMP plus the matching UIKit or SwiftUI contract, and verify the report schema/freshness.
2. Apply the shared fix first, then the host-specific fix only if the mismatch remains; rebuild Android/iOS rows affected by the shared change.

<!-- validator anchors: Independent Verification Exception | surviving_mutant | Bounded Fix→Re-verify Loop | Fix Closure Report Contract | gate-command packet | satisfied-by-citation | graceful degradation preserved | Discrimination Sensor for Visual Parity -->
