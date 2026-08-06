---
name: requirements-fix
description: "Executes fixes from a saved requirements audit report; not for findings-only review or broad feature design when acceptance criteria are missing."
license: MIT
metadata:
  version: "1.2.0"
---

### Requirements Fix

Execute fixes from a requirements audit markdown report only.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate; note its authorization spans one go-ahead through PR creation only — force-push, deploy, and merge stay separately gated) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

**Isolation Gate — before the first file edit:** execute `references/implementation-delivery.md` Stage 0–1 now (fetch base, create the worktree + branch, work inside it) and record the worktree path + branch — or one of Stage 1's two legal skip reasons, verbatim — before any repository mutation.

Not for findings-only requirements review — route to `workflows/requirements/requirements-audit.md`. Not for broad feature design when acceptance criteria are missing — route to `workflows/spec-driven.md`.

1. Resolve/reuse `workflowSessionId`: `requirements-fix-[entity]`
2. Load shared references:
   - `references/audit-report-io.md` before any code change
   - `references/lessons.md` to load confirmed project lessons
   - `references/codebase-investigation.md` before changing unfamiliar requirement flows
   - `references/verification-ladder.md` before non-trivial edits
   - `references/context-firewall.md` before inspecting large specs, diffs, generated reports, or broad search output
   - `references/agent-orchestration.md` only for large/high-risk findings, disjoint implementation slices, or independent verification
   - `references/discrimination-sensor.md` before closing any Standard+/Spec-driven-sized or high/critical-severity REQ finding, to size the mutation sensor against the code that now satisfies the Requirement Source
   - `references/knowledge-verification-chain.md` when the fix direction leans on an external library's or API's documented behavior — for this family the cited Requirement Source doubles as the chain's Step 0 anchor for what was required, per its Family Instantiations
   - `references/brownfield-mapping.md` (Minimum Bar only, Standard+ REQ findings) when step 3's recall turns up no hit for the target and no gate command can be derived from the report's evidence
3. `recall` -> load product decisions, accepted scope constraints, public contracts, compatibility rules, requirement interpretations, and verification recipes for the report target.
4. Select the requirements audit report with execution focus:
   - Establish the report selector, target focus, requirements source, and optional finding selector before selecting a report. Target focus can be a flow, feature, public contract, module, files/globs, branch comparison, commit range, symbol/class/function, or explicit whole-repo target.
   - If the user gives a path, read that exact markdown file.
   - If the user asks for "latest" or gives no path, require a concrete target focus first; do not run the latest requirements report against an unspecified target.
   - Select the latest `audits/requirements/<YYYY-MM-DD requirements-audit>.md` only after target focus is known, using `references/audit-report-io.md`.
   - Stop if no report exists; do not infer findings from conversation history.
   - Validate the report deterministically: `bun skills/massa-ai/scripts/validate_audit_report.ts <path> --family requirements` (`references/audit-report-io.md`, Deterministic Validation, checks `Requirements Source` too); non-zero exit blocks editing. Also confirm resolved files or material scope evidence and current file/line evidence; stop on stale, target-drifted, or ambiguous reports.
5. Extract actionable findings:
   - Keep findings with concrete `Requirement Source`, `Requirement ID or Quote`, `Requirement Gap Type`, `Location`, `Evidence`, `Impact`, `Simplest Fix Direction`, and `Verification Suggestion`.
   - Ignore ruled-out candidates and no-finding sections.
   - If the user supplied finding IDs, extract only those IDs after validating they exist and match the current target focus and requirements source.
   - Rank by mandatory requirement severity, dependency order, user-visible impact, compatibility risk, and testability.
6. Build a traceability matrix before editing:
   - Requirement ID/source -> audit finding ID -> current implementation evidence -> desired behavior -> files likely affected -> tests/docs needed -> verification command -> Linked .specs/ Requirement ID (when `.specs/` exists).
   - Mark each item as missing requirement, contradicted requirement, out-of-scope behavior, compatibility break, docs mismatch, or test/docs gap.
   - That last column is the join key step 13 uses to mirror closure status back into the originating spec.
7. Size each finding with `references/verification-ladder.md`:
   - Quick: local behavior correction, docs wording fix, config default correction, or focused test alignment.
   - Standard: multi-file behavior change, public API compatibility fix, UI/API contract update, or meaningful test impact; define verification recipe first.
   - Spec-driven: ambiguous requirement, new feature beyond audited scope, contract redesign, migration, or stakeholder tradeoff; pause and route to `workflows/spec-driven.md` or ask for approval.
8. Apply requirements fixing methods:
   - Missing requirement: implement the smallest behavior that satisfies the source requirement and add direct acceptance coverage.
   - Contradicted requirement: change behavior to match the source of truth, unless the report identifies a newer accepted decision.
   - Out-of-scope behavior: remove or guard behavior that exceeds non-goals, while preserving existing supported contracts.
   - Compatibility break: restore previous public contract or add a compatible bridge if the report requires compatibility.
   - Docs/test mismatch: update docs or tests to reflect delivered behavior only when implementation already matches the requirement.
9. Guard scope:
   - Do not reinterpret requirements beyond the report and cited source.
   - Preserve non-goals and explicit constraints.
   - `references/knowledge-verification-chain.md`'s Step 5 settles technical facts only (library/API behavior), never product intent; a product decision gap still stops here regardless of how the chain resolved.
   - If a finding exposes a product decision gap, stop and ask rather than inventing policy.
10. Use agent orchestration only when it improves signal, with one carve-out: the verification-agent dispatch below is mandatory at its tier gate rather than discretionary, per `references/agent-orchestration.md`'s Independent Verification Exception. Dispatch per `references/agent-orchestration.md`:

> **Dispatch: `massa-ai-builder`** (role: `builder`) — charter `skills/agents/builder/SKILL.md`
> - trigger: large/high-risk finding, disjoint implementation slice, or explicit subagent request
> - scope: one isolated requirements finding with a disjoint write set
> - permissions: write (disjoint write set)
> - inputs: the finding ID, requirement source, gap/contradiction/ambiguity, and simplest fix direction
> - sensors: report's verification suggestion or equivalent deterministic command; requirements-trace check
> - output: implementation summary, commands run, test counts, deviations
> - firewall: raw diffs/logs summarized
> - memory: suggest-only; main agent persists reusable requirements patterns
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
> - trigger: mandatory at Standard+/Spec-driven REQ-fix size or high/critical requirement severity, per the Independent Verification Mandate tier gate in `references/verification-ladder.md`'s Mandatory Verification Fix Gate; a Quick-tier REQ finding takes the fallback below instead
> - scope: the closed REQ row's Requirement Source alignment, acceptance evidence, and report claim closure
> - permissions: read-only
> - inputs: the finding, its Requirement Source and Requirement ID or Quote, the applied fix, the verification suggestion, and validation assets
> - sensors: deterministic command (requirements-trace check, acceptance tests, doc/spec alignment) and report claim closure; discrimination sensor per `references/discrimination-sensor.md` (the code that now satisfies the Requirement Source)
> - output: confirmed/disproven closure verdict against the Requirement Source, feeding the Fix Closure Report's Independent Verifier column
> - firewall: raw test output/logs summarized
> - memory: suggest-only; main agent persists requirements verification outcomes
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes re-check of each REQ closure row against its Requirement Source and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed
   - Main agent owns report parsing, traceability matrix, memory writes, final synthesis, and Evidence Gate.

11. Verify each completed finding:
   - If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
     `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
   - Apply the Mandatory Verification Fix Gate from `references/verification-ladder.md`: run the report's Verification Suggestion or an equivalent deterministic command/artifact check for each selected finding or coherent group.
   - Dispatch the verification-agent block above once a REQ finding reaches Standard+/Spec-driven size or high/critical severity; a Quick-tier finding instead runs the listed fallback self-check — the tier gate decides the hop, never the check itself.
   - A surviving mutant on the discrimination sensor blocks the row: mark the finding's Closure Matrix status `blocked` and log a `surviving_mutant` signal through `references/lessons.md`.
   - `references/verification-ladder.md`'s Bounded Fix→Re-verify Loop caps re-verify cycles per REQ finding at 3; exhausting it also lands `blocked`. That is a distinct counter from this file's own two-consecutive-failed-fixes breaker above, which trips inside one edit iteration rather than across re-verify cycles.
   - A finding cannot be marked `fixed` when a target-relevant command or artifact check exists but was not attempted; if verification cannot run, mark it `blocked`, `deferred`, or `skipped` with an allowed skipped-check reason.
   - Run the report's verification suggestion when available.
   - Run acceptance tests, targeted unit/integration tests, docs checks, type/build checks, or manual artifact inspection relevant to the requirement.
   - Update the traceability matrix status in the final report summary.
   - Record command/artifact, result, skipped reason or `none`, highest Verification Ladder level reached, validation assets protected, and residual risk.
12. At completion, persist only durable knowledge:
   - Accepted requirement interpretations, scope constraints, compatibility rules, or reusable acceptance-test recipes after scoring with the Importance Calibration System.
   - Use required tags: `project:<projectId>`, `session:<workflowSessionId>`, `workflow:requirements-fix`, `entity:<entity>`, and one `memory:<tier>` tag.
13. Write the Fix Closure Report per `references/audit-report-io.md`'s Fix Closure Report Contract, at `audits/requirements/<YYYY-MM-DD requirements-fix-closure>.md`, carrying the family's appended `Linked .specs/ Requirement ID` column; when `.specs/` exists, mirror each closed REQ row into its originating `.specs/features/<slug>/spec.md` requirement-status table — the same join `references/spec-driven/validate.md`'s Requirement Traceability Update performs from the verification side. Then run `bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family requirements` before Propose and the Evidence Gate — a non-zero exit blocks both. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).
14. Complete the Evidence Gate from `references/evidence-gate.md`.

## Examples

User asks: "Use requirements-fix to fix latest audit for checkout flow."

1. Confirm target focus is `checkout flow`, then read the latest matching `audits/requirements/* requirements-audit.md`.
2. Validate metadata, target focus, freshness, required fields, requirement source, and current evidence before editing.
3. Build a requirement traceability matrix.
4. Fix mandatory gaps and contradictions before lower-severity docs/test issues.
5. Verify against the cited requirement source.

<!-- validator anchors: Linked .specs/ Requirement ID | Independent Verification Exception | audits/requirements/<YYYY-MM-DD requirements-fix-closure>.md | check_fix_closure.ts <closure.md> --family requirements | surviving_mutant | Bounded Fix→Re-verify Loop | Requirement Traceability Update | graceful degradation preserved -->
