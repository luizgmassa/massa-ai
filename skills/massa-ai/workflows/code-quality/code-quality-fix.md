---
name: code-quality-fix
description: "Executes fixes from a saved code quality audit report; not for findings-only SOLID, Clean Code, KISS, YAGNI, DRY, or overengineering analysis."
license: MIT
metadata:
  version: "1.2.0"
---

### Code Quality Fix

Execute fixes from a code quality audit markdown report only.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate — its Stage 3 delivery-authorization scope covers one go-ahead through PR creation; force-push/deploy/merge stay separately gated) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

Not for findings-only SOLID, Clean Code, KISS, YAGNI, DRY, maintainability, or overengineering analysis — route to `workflows/code-quality/code-quality-audit.md`.

1. Resolve/reuse `workflowSessionId`: `code-quality-fix-[entity]`
2. Load shared references:
   - `references/audit-report-io.md` before any code change
   - `references/lessons.md` to load confirmed project lessons
   - `references/codebase-investigation.md` before changing unfamiliar code
   - `references/verification-ladder.md` before non-trivial edits
   - `references/discrimination-sensor.md` before closing a behavior-preservation finding at Standard+/Spec-driven size or high/critical severity, to size the mutation-target sensor against the transformed code
   - `references/knowledge-verification-chain.md` when the fix direction depends on an external library or API's current behavior rather than in-repo convention
   - `references/naming-standards.md` before renaming identifiers, introducing domain vocabulary, or changing public contract names
   - `references/context-firewall.md` before inspecting large diffs, logs, generated reports, or broad search output
   - `references/agent-orchestration.md` only for large/high-risk findings, disjoint implementation slices, or independent verification
   - `references/brownfield-mapping.md` (Minimum Bar) when a Standard+ finding's target has no recall hit and the report's evidence yields no derivable gate command
3. `recall` -> load project style rules, accepted quality exceptions, testing conventions, prior anti-patterns, and verification recipes for the report target.
4. Select the code quality audit report with execution focus:
   - Establish the report selector, target focus, and optional finding selector before selecting a report. Target focus can be a module, service layer, files/globs, branch comparison, commit range, symbol/class/function, feature/flow, or explicit whole-repo target.
   - If the user gives a path, read that exact markdown file.
   - If the user asks for "latest" or gives no path, require a concrete target focus first; do not run the latest code quality report against an unspecified target.
   - Select the latest `audits/code-quality/<YYYY-MM-DD code-quality-audit>.md` only after target focus is known, using `references/audit-report-io.md`.
   - Stop if no report exists; do not infer findings from conversation history.
   - Validate the report deterministically: `bun skills/massa-ai/scripts/validate_audit_report.ts <path> --family code-quality` (`references/audit-report-io.md`, Deterministic Validation); non-zero exit blocks editing. Also confirm resolved files or material scope evidence and current file/line evidence; stop on stale, target-drifted, or ambiguous reports.
5. Extract actionable findings:
   - Keep findings with concrete `Rule`, `Current Shape`, `Simplest Safe Transformation`, `Location`, `Evidence`, `Impact`, `Simplest Fix Direction`, and `Verification Suggestion`.
   - Ignore ruled-out candidates, no-finding sections, and `suspect` items unless the user explicitly asks to address suspects.
   - Treat findings that require bounded-context language, dependency direction, strength/distance/volatility, seam placement, adapter design, or module-depth analysis as invalid for code-quality execution unless the report already reclassified them as local CQ cleanup. Route those to `workflows/architecture/architecture-fix.md` or ask the user to rerun architecture-audit.
   - If the user supplied finding IDs, extract only those IDs after validating they exist and match the current target focus.
   - Rank by severity, dependency order, behavior risk, and deletion/simplification payoff.
6. Build a refactoring map before editing:
   - Finding ID -> affected code, quality rule, current behavior contract, validation assets, simplest safe transformation, and expected diff shape.
   - Group duplicate-rule findings only when one small change fixes all of them.
   - Keep unrelated style cleanup out of scope.
7. Size each finding with `references/verification-ladder.md`:
   - Quick: rename, inline, delete unused speculation, extract constant, collapse trivial wrapper, or local parameter-object change.
   - Standard: multi-file consolidation, shared behavior cleanup, public helper contract change, or meaningful test impact; define characterization checks first.
   - Spec-driven: broad redesign, unclear behavior, cross-boundary migration, or user-visible behavior change; pause and route to `workflows/spec-driven.md` or ask for approval.
8. Apply code quality fixing methods:
   - SOLID: separate mixed responsibilities only when the split yields an externally-findable named unit (locatable by search or grep from outside the file) or reduces change risk; replace caller-side type switches with polymorphism or data maps only when new variants are real; preserve base contracts; narrow fat interfaces; inject dependencies when hardcoded concretes block testing or substitution.
   - Clean Code: name domain concepts precisely using `references/naming-standards.md`, replace repeated magic values with named constants, split functions only when the result yields an externally-findable named unit (locatable by search or grep from outside the file) or measurably reduces change risk — never split on size or "more than one thing" alone — remove code-restating comments, finish or delete stubs, and convert long positional parameter lists to options objects when it improves call-site clarity.
   - KISS: inline shallow helpers, collapse needless layers, choose direct control flow over clever indirection, and remove configuration that hides rather than expresses behavior. When choosing whether to split instead of inline, apply the same discoverability-or-change-risk criterion used for the Clean Code split direction above.
   - YAGNI: delete unused extension points, future hooks, unused options, one-implementation factories, and speculative public APIs when usage evidence is absent.
   - DRY: consolidate duplicated domain rules or transformations into one clear source of truth, but avoid abstractions that make trivial duplication harder to read.
   - AI-slop cleanup: remove generic wrappers, fabricated-looking abstractions, one-call factories, code-restating comments, and unused configurability when current usage evidence does not justify them.
   - Do not introduce ports, adapters, bounded contexts, new service/module boundaries, or VSA-style folder migration to satisfy a code-quality finding.
9. Preserve behavior:
   - Run or identify characterization tests before changing behavior-adjacent code.
   - Do not weaken tests, fixtures, snapshots, types, or public contracts to make cleanup pass.
   - Prefer small reversible edits; verify after each finding or coherent group.
10. Use agent orchestration only when it improves signal — except the verification-agent dispatch below, which `references/agent-orchestration.md`'s Independent Verification Exception mandates at the tiers named in its trigger regardless of signal improvement. Dispatch per `references/agent-orchestration.md`:

> **Dispatch: `massa-ai-builder`** (role: `builder`) — charter `skills/agents/builder/SKILL.md`
> - trigger: large/high-risk finding, disjoint implementation slice, or explicit subagent request
> - scope: one isolated code-quality finding or disjoint file group
> - permissions: write (disjoint write set)
> - inputs: the finding ID, smell category (SOLID/Clean Code/KISS/YAGNI/DRY), location, and simplest fix direction
> - sensors: report's verification suggestion or equivalent deterministic command; behavior-preservation check
> - output: implementation summary, commands run, test counts, deviations
> - firewall: raw diffs/logs summarized
> - memory: suggest-only; main agent persists reusable code-quality patterns
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

> **Dispatch: `massa-ai-reviewer`** (role: `reviewer`) — charter `skills/agents/reviewer/SKILL.md`
> - trigger: implementation of the CQ finding complete, before the verification gate — never optional
> - scope: the fix's diff surface and its task/AC context
> - permissions: read-only
> - inputs: diff, CQ acceptance context, recalled code-quality conventions
> - sensors: bugs, regressions, missing edge cases, smells introduced by the diff
> - output: ranked findings, blocking vs advisory; blocking findings become CQ fix items before verification runs
> - firewall: summarized findings only, never raw diff dumps
> - memory: suggest-only; main agent persists review outcomes for the code-quality fix
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes review against this output contract and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

> **Dispatch: `massa-ai-verification-agent`** (role: `verification-agent`) — charter `skills/agents/verification-agent/SKILL.md`
> - trigger: mandatory per the verification-ladder's Independent Verification Mandate at Standard+/Spec-driven finding size or high/critical severity; at Quick size the subagent hop is skipped and the standalone fresh-eyes check below runs instead
> - scope: the fixed finding's behavior-preservation claim over the moved/transformed code, its call sites/imports, and report claim closure
> - permissions: read-only
> - inputs: the finding, the applied fix, the verification suggestion, and validation assets
> - sensors: deterministic command (behavior-preservation check, import graph, characterization tests); discrimination sensor per `references/discrimination-sensor.md` (mutate the pre-fix moved/transformed code the behavior-preservation claim protects, never newly introduced code)
> - output: confirmed/disproven closure verdict with evidence
> - firewall: raw test output/logs summarized
> - memory: suggest-only; main agent persists code-quality verification outcomes
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes re-check of the code-quality closure evidence against this output contract and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed
   - Main agent owns report parsing, prioritization, memory writes, final synthesis, and Evidence Gate.

11. Verify each completed finding:
   - If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
     `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
   - Apply the Mandatory Verification Fix Gate from `references/verification-ladder.md`: run the report's Verification Suggestion or an equivalent deterministic command/artifact check for each selected finding or coherent group.
   - A finding cannot be marked `fixed` when a target-relevant command or artifact check exists but was not attempted; if verification cannot run, mark it `blocked`, `deferred`, or `skipped` with an allowed skipped-check reason.
   - Run the report's verification suggestion when available.
   - Run targeted tests, type checks, lint/static checks, or import checks relevant to touched files.
   - Perform a focused diff review for touched identifiers and confirm generic names are either replaced with precise domain/role names or justified by narrow conventional scope.
   - Check validation assets were not weakened unless explicitly requested.
   - Record command/artifact, result, skipped reason or `none`, highest Verification Ladder level reached, validation assets protected, and residual risk.
   - At the same Standard+/Spec-driven-or-high/critical tiers as the Independent Verification Mandate, run the discrimination sensor from `references/discrimination-sensor.md` against the pre-fix moved/transformed code the behavior-preservation claim protects; Quick mechanical transforms (rename, inline, delete) are exempt. A surviving mutant is an unproven preservation claim: strengthen the characterization test or close the row `blocked` and emit the `surviving_mutant` lessons signal — do not mark it `fixed`.
   - When a survivor traces to cross-boundary coupling rather than a weak assertion, route it through this workflow's step 5 reclassification gate (bounded-context/dependency-direction/seam/module-depth invalidity check) to `workflows/architecture/architecture-fix.md` instead of forcing a local fix.
   - The fix→re-verify cycle is capped per `references/verification-ladder.md`'s Bounded Fix→Re-verify Loop; exceeding the cap stops the finding at `Blocked` with evidence preserved. That cap is a separate counter from the two-consecutive-failed-fixes breaker in the preamble above — the breaker fires inside a single iteration and neither consumes nor resets the cap.
12. Close out with the Fix Closure Report:
   - Write the Fix Closure Report per `references/audit-report-io.md` (Fix Closure Report Contract) to `audits/code-quality/<YYYY-MM-DD code-quality-fix-closure>.md`, one Closure Matrix row per selected finding.
   - Run `bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family code-quality` before Propose/Evidence Gate; a non-zero exit blocks Propose. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).
13. At completion, persist only durable knowledge:
   - Repeated anti-patterns, accepted quality exceptions, project-specific refactoring recipes, or reusable checks after scoring with the Importance Calibration System.
   - Use required tags: `project:<projectId>`, `session:<workflowSessionId>`, `workflow:code-quality-fix`, `entity:<entity>`, and one `memory:<tier>` tag.
14. Complete the Evidence Gate from `references/evidence-gate.md`.

## Examples

User asks: "Use code-quality-fix to fix latest findings for billing services."

1. Confirm target focus is `billing services`, then read the latest matching `audits/code-quality/* code-quality-audit.md`.
2. Validate metadata, target focus, freshness, required fields, and current evidence before editing.
3. Execute confirmed non-suspect findings by severity and behavior risk.
4. Prefer delete/inline/rename/extract before introducing new abstractions.
5. Verify behavior and validation assets after each finding group.

<!-- validator anchors: references/discrimination-sensor.md; references/knowledge-verification-chain.md; references/brownfield-mapping.md; Independent Verification Exception; Fix Closure Report Contract; check_fix_closure.ts --family code-quality; Bounded Fix→Re-verify Loop; Stage 3 delivery-authorization scope -->

