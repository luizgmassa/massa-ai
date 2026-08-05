### Bugs Audit

Findings-only bug discovery scoped to a concrete target: modified files, explicit files/globs, commit ranges, branch comparisons, modules/packages, symbols/classes/functions, feature/runtime flows, explicitly requested whole-repo scope, or an implementation scope packet supplied by `workflows/implementation/implementation-audit.md`.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Not to fix a known broken behavior — route to `workflows/debug.md`. Not for SOLID, Clean Code, KISS, YAGNI, DRY, maintainability, or overengineering analysis — route to `workflows/code-quality/code-quality-audit.md`. For a multi-lens implementation review, route to `workflows/implementation/implementation-audit.md`. When invoked by implementation audit, this workflow is the Correctness lens only.

Findings-only: do not edit code unless the user separately asks for fixes.

1. Resolve/reuse `workflowSessionId`: `bugs-audit-[entity]`
2. Load shared references:
   - `references/codebase-investigation.md`
   - `references/audit-scope.md`
   - `references/audit-report-io.md` before writing the final direct audit report
   - `references/context-firewall.md` before inspecting large diffs, logs, snapshots, generated reports, or broad search output
   - `references/synapse-policy.md` when repeated massa-ai searches are expected
   - `references/agent-orchestration.md` only for large scopes, explicit parallel/subagent requests, PR subagent invocation, or independent verification of high-impact findings
3. `recall` -> load prior bug patterns, known regressions, project constraints, ADRs, fragile flows, and accepted exceptions for the target area.
   - Apply the Memory Freshness Gate from `references/audit-scope.md`; recalled exceptions are leads, not proof.
4. Establish the investigation scope before proceeding:
   - Modified files scope: use when the user says modified files, changed files, current changes, uncommitted changes, staged changes, or unstaged changes.
   - Explicit files/globs scope: use when the user names files, directories, or globs.
   - Commit range scope: use when the user provides commits/ranges or asks for commits made by me, my branch commits, or bugs introduced by branch commits.
   - Branch comparison scope: use when the user names base/head branches, refs, or a branch diff.
   - Codebase area scope: use when the user names a path, module, package, feature area, service, or glob.
   - Symbol/class/function scope: use when the user names public classes, functions, APIs, handlers, or exported surfaces.
   - Feature/flow scope: use when the user names a runtime flow, user journey, or feature area.
   - Whole-repo scope: use only when the user explicitly asks for a whole-repo bug audit.
   - Implementation parent scope: use only when `workflows/implementation/implementation-audit.md` invokes this workflow with a concrete implementation scope packet.
   - If the target focus is missing, vague, or too broad, ask for a concrete target from the supported scope types in `references/audit-scope.md`.
   - Build or accept the shared scope packet from `references/audit-scope.md` and carry it into the report.
5. Resolve the selected branch's mechanics (modified files, commit range, codebase area, explicit-files/branch/symbol/feature/whole-repo, or implementation parent scope) per `references/audit-scope.md` (Lens Audit Scope Resolution Procedure, Bugs row of Per-Lens Scope Deltas).
6. Investigation pass. Dispatch `audit-specialist` per `references/agent-orchestration.md` when the scope justifies an isolated read-only subagent:

> **Dispatch: `massa-ai-audit-specialist`** (role: `audit-specialist`) — charter `skills/agents/audit-specialist/SKILL.md`
> - trigger: large scope, explicit parallel/subagent request, PR subagent invocation, or independent verification of high-impact finding
> - scope: the bugs audit target — files, diffs, suspicious paths
> - permissions: read-only
> - inputs: shared scope packet; `lens: bugs`; recalled regressions, known bug patterns, accepted exceptions
> - sensors: trace input -> transformation -> output; check diffs, callers/callees, tests, config, migrations; prioritize correctness bugs, crashes, data loss, security regressions, broken contracts, async/race issues
> - output: findings with bug category, location, evidence, trigger, severity, confidence, simplest fix direction, verification suggestion
> - firewall: raw diffs/logs/search output summarized, not returned raw
> - memory: suggest-only; main agent persists reusable bug patterns
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

    - Trace input -> transformation -> output for each suspicious path.
   - Check diffs, surrounding code, callers and callees, tests, config, migrations, schemas, and recalled project patterns.
   - Prioritize correctness bugs, crashes, data loss, security regressions, broken contracts, async or race issues, validation or authorization gaps, persistence and migration bugs, environment/config issues, and behavior that contradicts tests or public API contracts.
   - For each candidate finding, record the concrete claim, bug class, source evidence, impacted flow, trigger or repro path, root-cause hypothesis, regression risk, provisional severity, and what would disprove it.
7. False-positive pass:
   - Try to disprove every candidate before reporting it.
   - Check guards, type checks, tests, feature flags, framework contracts, call paths, existing invariants, ADRs, and accepted exceptions.
   - Use official docs or web research only when current external API or framework behavior matters.
   - Drop candidates disproven by evidence, downgrade candidates with partial mitigation, and mark low-confidence findings explicitly.
8. Severity rules (apply the countable threshold first, then the qualitative clause):
   - `critical`: likely data loss, security bypass, production outage, irreversible corruption, auth/privacy break, OR affects >10 files; otherwise use the qualitative clause below.
   - `high`: likely crash, major regression, broken core flow, incorrect persistence, missing required validation, or severe operational risk.
   - `medium`: real edge-flow bug, recoverable incorrect behavior (<=10 affected files), flaky async/state risk, incomplete error handling, or meaningful test gap around changed logic.
   - `low`: minor bug, low-impact incorrect behavior, defensive hardening opportunity, incomplete evidence, or weakly supported concern.
9. Final report:
   - Findings first, ordered by severity: `critical`, `high`, `medium`, `low`.
   - Each finding must use `BUG-<N>` and include the canonical fields from `references/audit-report-io.md`: severity, confidence, file/line, evidence, bug class, impacted flow, trigger or repro path, root-cause hypothesis, regression risk, impact, simplest fix direction, and verification suggestion.
   - If no bugs are found, say that clearly and list scope checked plus skipped checks.
   - Include ruled-out candidates when they were plausible enough to matter.
   - Include scope checked, deterministic evidence or skipped-check notes, memory outcome, and residual risk.
   - Include the Verification/Test Fidelity Checklist from `references/audit-report-io.md`; tie every `BUG-*` finding or no-finding claim to deterministic sensors, commands/artifacts, results, validation assets, or skipped-check reasons. Model judgment alone cannot satisfy verification/testing all-clear.
   - For direct top-level invocation, use the Plan Mode save rule and canonical report contract from `references/audit-report-io.md` for `audits/bugs/<YYYY-MM-DD bugs-audit>.md`.
   - For implementation audit child invocation, return compact findings to the parent unless the parent explicitly requests saved audit artifacts.
10. Persist only durable knowledge:
   - Do not persist one-off findings.
   - Persist repeated bug patterns, fragile project-specific flows, accepted exceptions, or reusable verification recipes after scoring with the Importance Calibration System.
   - Use required tags: `project:<projectId>`, `session:<workflowSessionId>`, `workflow:bugs-audit`, `entity:<entity>`, and one `memory:<tier>` tag.
11. Complete the Evidence Gate from `references/evidence-gate.md`.

## Examples

User asks: "Find bugs in modified files."

1. Use `workflowSessionId=bugs-audit-modified-files`.
2. Scope to staged, unstaged, and relevant untracked files; exclude generated/dependency/build/log/cache/secret paths.
3. Inspect diffs first, then surrounding code and tests for suspicious changes.
4. Run a false-positive pass before reporting findings.

User asks: "Review commits made by me in this branch for bugs."

1. Use `workflowSessionId=bugs-audit-branch-commits`.
2. Resolve author from Git config and branch base from upstream or main/master fallback.
3. Review only branch-unique commits authored by that identity.
4. Report findings by severity with confidence, evidence, and verification suggestions.
