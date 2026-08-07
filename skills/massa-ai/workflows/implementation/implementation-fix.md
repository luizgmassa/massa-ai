---
name: implementation-fix
description: "Executes confirmed findings from a saved implementation audit report; the saved audits/implementation report is the source of truth, not chat summaries."
license: MIT
metadata:
  version: "1.3.0"
---

### Implementation Fix

Execute confirmed findings from a saved implementation audit markdown report only.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate; one go-ahead spans through PR creation only, not force-push, deploy, or merge) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

**Isolation Gate — before the first file edit:** execute `references/implementation-delivery.md` Stage 0–1 now (fetch base, create the worktree + branch, work inside it) and record the worktree path + branch — or one of Stage 1's two legal skip reasons, verbatim — before any repository mutation.

Do not execute from chat summaries, inline review comments, remembered findings, or old PR audit reports. The saved `audits/implementation/<YYYY-MM-DD implementation-audit.md>` report is the source of truth. Route fresh findings work to `workflows/implementation/implementation-audit.md`.
**Reuse Scan — before writing new implementation code:** run the mandatory reuse scan per `references/code-reuse-scan.md` (separate read-only subagents; the reuse map's use/extend/new decisions are consumed before new code is planned or written) — or record its inline-fallback reason, verbatim.


1. Resolve/reuse `workflowSessionId`: `implementation-fix-[entity]`.
2. Load shared references:
   - `references/audit-report-io.md` before any code or test change.
   - `references/audit-scope.md` for target matching and freshness.
   - `references/lessons.md` to load confirmed project lessons
   - `references/codebase-investigation.md` before changing unfamiliar paths.
   - `references/verification-ladder.md` before non-trivial edits.
   - `references/naming-standards.md` before introducing, renaming, or preserving identifiers as part of a finding fix.
   - `references/context-firewall.md` before large diffs, logs, snapshots, reports, or broad searches.
   - `references/discrimination-sensor.md` before closing any finding at the tiers the verification-ladder's Independent Verification Mandate names.
   - `references/knowledge-verification-chain.md` when a finding's fix depends on external library/API behavior not already verified this session.
   - `references/brownfield-mapping.md` (Minimum Bar only) for Standard+ findings when recall returns no hit for the target and no gate command is derivable from the report's evidence.
   - `references/agent-orchestration.md` for high-risk findings or disjoint implementation slices; the mandated verification-agent dispatch below is carved out of this trigger by agent-orchestration's Independent Verification Exception and always attempts dispatch at its own tier gate.
3. `recall` -> load prior implementation audit decisions, known regressions, architecture/security boundaries, accepted exceptions, testing conventions, and reusable verification recipes for the target.
4. Select the report with an explicit execution focus:
   - Establish report selector, target focus, and optional source-qualified finding IDs before selecting a report.
   - If the user provides a path, read that exact markdown file.
   - If the user asks for `latest` or omits a path, require a concrete target focus first, then select the latest matching `audits/implementation/<YYYY-MM-DD implementation-audit.md>` using `references/audit-report-io.md`.
   - Stop if no saved report exists. Tell the user to run `implementation-audit` or provide a report path.
   - Validate the report deterministically: `bun skills/massa-ai/scripts/validate_audit_report.ts <path> --family implementation` (`references/audit-report-io.md`, Deterministic Validation); non-zero exit rejects the report (missing metadata, or malformed/duplicate/gapped/mis-Area'd source-qualified IDs).
5. Validate freshness before editing:
   - Verify project, target, target focus, scope, base/head, and resolved files match the current execution target.
   - Re-resolve the current target and stop when material drift invalidates the report unless the user explicitly accepts the risk.
   - Inspect every selected finding's current location and evidence. Stop or re-audit when files moved, cited code no longer exists, evidence no longer proves the claim, or newer code changed the contract.
   - Treat unknown required fields, low-confidence suspects, skipped lenses, and `not evaluated` lenses as non-actionable unless explicitly included by the user.
6. Extract actionable findings:
   - Require source-qualified IDs of the form `Area/PREFIX-N` (e.g., `Correctness/BUG-1`, `Architecture/ARCH-1`, `Code Quality/CQ-1`, `Security/SEC-2`, `Requirements/REQ-1`, `Tests/TST-1`), plus severity, confidence, source lens, original ID, location, evidence, impact, smallest fix direction, and verification suggestion. The Area must match the source lens that produced the finding; the canonical area/prefix table and discipline live in `references/audit-report-io.md` (Source-Qualified Finding IDs).
   - Ignore ruled-out candidates, skipped-check notes, no-finding summaries, and suspects unless explicitly selected.
   - SonarQube-derived items: see `references/sonarqube-mcp.md` (Fix-Time Consumption) — actionable only via normalized report entries, never raw MCP output.
   - If finding IDs are supplied, execute only those IDs after validating target and report membership.
   - Deduplicate findings sharing one root cause while preserving every original ID in the closure matrix.
7. Build one remediation matrix before editing: finding -> source lens -> severity -> confidence -> root fix -> likely files -> validation assets -> naming/public-contract impact -> verification command -> dependency/order -> status. Prioritize critical/high findings, then dependency order, blast radius, and verification cost. Keep unrelated cleanup out of scope.
8. Route each fix by source lens:
   - Correctness/`BUG-`: apply `bugs-fix` methods and add regression coverage when feasible.
   - Security/`SEC-`: apply `security-fix` methods, fail closed, and add negative validation when feasible.
   - Tests/`TST-`: apply `tests-fix` methods and strengthen deterministic sensors without brittle fixtures.
   - Requirements/`REQ-`: apply `requirements-fix` methods and preserve traceability, non-goals, and compatibility.
   - Architecture/`ARCH-`: apply `architecture-fix` methods; route broad redesign to `spec-driven`.
   - Code Quality/`CQ-`: apply `code-quality-fix` methods using small reversible simplification.
9. Size each finding with `references/verification-ladder.md`. Quick findings may proceed locally; Standard findings require characterization and an explicit recipe; ambiguous, cross-boundary, migration-heavy, or broad redesign findings pause and route to `spec-driven`.
10. Orchestrate conservatively. The main agent owns report parsing, scope/freshness, prioritization, questions, memory, and final evidence. Dispatch per `references/agent-orchestration.md`:

> **Dispatch: `massa-ai-builder`** (role: `builder`) — charter `skills/agents/builder/SKILL.md`
> - trigger: isolated finding with disjoint write set and concrete verification
> - scope: one isolated implementation finding with a disjoint write set
> - permissions: write (disjoint write set)
> - inputs: the source-qualified finding ID (`Area/PREFIX-N`), target files, validation assets, and verification command
> - sensors: report's verification suggestion or equivalent deterministic command per lens
> - output: implementation summary, commands run, test counts, deviations
> - firewall: raw diffs/logs summarized
> - memory: suggest-only; main agent persists reusable patterns
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

    Never run parallel writers against shared files or contracts.

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
> - trigger: an `Area/PREFIX-N` finding's closure meets the verification-ladder's Independent Verification Mandate tier gate — Standard+/Spec-driven size or any high/critical-severity finding
> - scope: the closed `Area/PREFIX-N` finding's fix diff, its source-lens claim, and the validation assets the fix touches
> - permissions: read-only
> - inputs: the source-qualified finding ID, the applied fix diff, the report's Verification Suggestion, and the pending closure-matrix row
> - sensors: the deterministic command/artifact named in the closure row for that lens; discrimination sensor per `references/discrimination-sensor.md` (the code under the closed finding's claim)
> - output: confirmed/disproven closure verdict per `Area/PREFIX-N` row, ladder level reached, residual risk
> - firewall: raw test/build output and diffs summarized to verdict plus evidence pointers
> - memory: suggest-only; main agent persists implementation-closure verification outcomes
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes re-check of each closed Area/PREFIX-N row against this output contract and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

11. Verify each completed finding with the Mandatory Verification Fix Gate from `references/verification-ladder.md`: run the report's Verification Suggestion or an equivalent deterministic command/artifact check, then run focused tests, build, lint, type, static, or runtime checks relevant to the source lens. At the tiers the ladder's Independent Verification Mandate names, also run the Discrimination Sensor (`references/discrimination-sensor.md`) against the code under the closed finding's claim; a surviving mutant marks that closure row `blocked` (not `fixed`) and emits the `surviving_mutant` lessons signal. Reinspect tests, fixtures, snapshots, types, specs, public contracts, and touched identifiers so validation assets were not weakened and names follow `references/naming-standards.md`. A finding cannot be marked `fixed` when a target-relevant command or artifact check exists but was not attempted; if verification cannot run, mark it `blocked`, `deferred`, or `skipped` with an allowed skipped-check reason. The fix→re-verify cycle is capped at the ladder's 3-iteration limit per finding — distinct from the preamble's two-consecutive-failed-fixes breaker above, which fires on edit attempts inside a single iteration and routes to `references/root-cause-scripts.md` rather than closing a finding `blocked`.
12. Persist the closure evidence as the Fix Closure Report defined in `references/audit-report-io.md` (Fix Closure Report Contract), at `audits/implementation/<YYYY-MM-DD implementation-fix-closure>.md`, one row per selected finding keyed by its source-qualified `Area/PREFIX-N` ID: status (`fixed`, `deferred`, `blocked`, `skipped`), changed files, command/artifact, result, skipped reason or `none`, discrimination sensor verdict, independent verifier verdict, highest Verification Ladder level reached, validation assets protected, residual risk, and exact next step for deferred or blocked findings. Run `bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family implementation` before Propose/Evidence Gate; a non-zero exit blocks closure. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).
13. If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
     `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
14. Persist only reusable root-cause patterns, approved remediation exceptions, durable architecture/security/requirements decisions, or project-specific verification recipes after Importance Calibration. Use `workflow:implementation-fix` and required project/session/entity/memory tags.
15. Complete `references/evidence-gate.md`.

## Examples

User asks: "Use implementation-fix to fix the latest audit findings for my modified files."

1. Resolve modified files as target focus and select the latest matching implementation report.
2. Validate report metadata, current files, and finding evidence.
3. Fix confirmed findings by source lens and report the closure matrix.

User asks: "Fix Security/SEC-2 from audits/implementation/2026-06-15 implementation-audit.md."

1. Read the exact report and validate `Security/SEC-2` against current source.
2. Apply security-fix methods only to that finding.
3. Preserve all other findings for later execution.

<!-- validator anchors: "Fix Closure Report defined in `references/audit-report-io.md`", "audits/implementation/<YYYY-MM-DD implementation-fix-closure>.md", "bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family implementation", "discrimination sensor per `references/discrimination-sensor.md`", "surviving_mutant` lessons signal", "graceful degradation preserved", "Independent Verification Exception", "brownfield-mapping.md` (Minimum Bar only)" -->

