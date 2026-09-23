---
name: code-quality-audit
description: "Findings-only audit workflow for SOLID, Clean Code, KISS, YAGNI, DRY, maintainability, and code-smell issues in a concrete target; not for architecture concerns."
license: MIT
metadata:
  version: "1.1.0"
---

### Code Quality Audit

Findings-only audit of SOLID, Clean Code, KISS, YAGNI, DRY, maintainability, overengineering, code smell, or violations-check issues, scoped to a concrete target: modified files, explicit files/globs, commit ranges, branch comparisons, modules/packages, symbols/classes/functions, feature/runtime flows, explicitly requested whole-repo scope, or an implementation scope packet supplied by `workflows/implementation/implementation-audit.md`.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Not for domain boundaries, bounded contexts, coupling analysis, module depth, seams, adapters, or architecture refactor opportunities — route those to `workflows/architecture/architecture-audit.md`. Keep local pass-through wrappers, unused speculation, vague names, duplicate literals, and simple overengineering here when the finding does not require architecture-lens evidence.

Findings-only: do not edit code unless the user separately asks for fixes.

1. Resolve/reuse `workflowSessionId`: `quality-[entity]`
2. Load shared references:
   - `references/codebase-investigation.md`
   - `references/audit-scope.md`
   - `references/audit-report-io.md` before writing the final direct audit report
   - `references/context-firewall.md` before inspecting large diffs, logs, snapshots, generated reports, or broad search output
   - `references/mobile-context.md` when scope includes Android Jetpack Compose or KMP Compose Multiplatform files, source sets, compiler reports, UI tests, screenshot tests, or runtime evidence
   - `references/naming-standards.md` when evaluating generic names, domain vocabulary, public contract names, or rename recommendations
   - `references/synapse-policy.md` when repeated massa-ai searches are expected
   - `references/agent-orchestration.md` only for large scopes, explicit parallel/subagent requests, PR subagent invocation, or independent verification of high-impact findings
3. `recall` -> load project style rules, ADRs, prior quality decisions, accepted extension points, repeated anti-patterns, and accepted exceptions for the target area.
   - Apply the Memory Freshness Gate from `references/audit-scope.md`; recalled exceptions are leads, not proof.
4. Establish the investigation scope: select the scope type and build the shared scope packet per `references/audit-scope.md`, which owns the supported scope types, the ask-when-vague rule, and the packet fields. Carry the packet into the report.
5. Resolve the selected branch's mechanics (modified files, commit range, codebase area, explicit-files/branch/symbol/feature/whole-repo, or implementation parent scope) per `references/audit-scope.md` (Lens Audit Scope Resolution Procedure, Code Quality row of Per-Lens Scope Deltas).
6. Input rules:
   - SOLID inputs: non-test source files only.
   - Clean Code inputs: test and non-test source files.
   - KISS/YAGNI/DRY inputs: test and non-test source files, plus docs/config only when they define behavior or public contracts.
   - Architecture boundary guard:
     - Keep local quality issues in this workflow when the fix is delete, inline, rename, extract a constant, collapse a trivial wrapper, simplify control flow, or consolidate duplicated local rules.
     - Route to `workflows/architecture/architecture-audit.md` when the claim needs bounded-context language, dependency direction, strength/distance/volatility, module depth, seam placement, adapter reality, or cross-domain ownership evidence.
     - If unsure, report as `suspect` only when concrete local maintainability evidence exists; otherwise recommend an architecture-audit follow-up instead of forcing a CQ finding.
7. Decide whether to use agent orchestration:
   - Load it only for large PRs, codebase-wide audits, explicit parallel/subagent requests, or independent verification of judgment-heavy findings.
   - Keep the audit local for small scopes, unresolved user intent, tightly coupled code without clear owners, or platforms that do not permit subagents.
   - The main agent still owns scope, memory recall, static leads, synthesis, final report, persistence, and Evidence Gate.
    - If delegating, dispatch `code-reviewer` in `audit` mode with `lens: code-quality` per `references/agent-orchestration.md`:

> **Dispatch: `code-reviewer`** (role: `code-reviewer`, mode: `audit`) — charter `skills/agents/code-reviewer/SKILL.md`
> - trigger: large PR, codebase-wide audit, explicit parallel/subagent request, or independent verification of judgment-heavy finding
> - scope: bounded read-only slice of the audit target
> - inputs: shared scope packet; `lens: code-quality`; quality dimensions (SOLID, Clean Code, KISS/YAGNI, DRY, maintainability)
> - sensors: static scans for type-tag branches, concrete construction, half-finished surfaces; source inspection
> - output: findings with smell category, location, evidence, severity, confidence, and simplest fix direction
> - firewall: raw diffs/logs/search output summarized, not returned raw
> - memory: suggest-only; main agent persists reusable code-quality patterns

    - Do not delegate every check by default; avoid duplicate source reading when one main-agent pass is cheaper.
    - Subagents may suggest memory content, but the main agent decides what durable knowledge to persist.
8. Gather deterministic leads with static scans where useful:
   - Type-tag branches: `switch`, `case`, `if/else if`, discriminant fields such as `type`, `kind`, `variant`, `mode`.
   - Concrete construction: `new [A-Z]` inside class or service bodies.
   - Half-finished surfaces: `TODO`, `implement later`, exported stubs, `return null`, empty method bodies.
   - Comments: lines starting with code-restating comments.
   - Magic values: repeated strings, event names, timeouts, numeric thresholds, status codes.
   - Generic names: `data`, `info`, `result`, `value`, `temp`, `manager`, `handler`, `helper` without useful qualification, using `references/naming-standards.md` to filter conventional short-scope or framework-required names.
   - Long parameter lists: more than 3-4 positional parameters.
   - File shape: apply the File Shape rule in `references/code-quality-lens.md`.
   - Needlessly indirect code: pass-through wrappers, one-use abstractions, helper layers with no behavior, factories/builders that only hide one constructor call.
   - Speculative surfaces: unused options, future-oriented hooks, extension points with one implementation, exported APIs with no evidence of use.
   - Complexity without payoff: deep nesting, miniature state machines, or polymorphism where a direct branch or data map would preserve clarity.
   - AI-slop surfaces: generic abstractions with no domain vocabulary, fabricated-looking type names, unnecessary factories/builders, wrappers around one call, comments that narrate obvious code, and broad configurability not supported by current requirements.
   - Android/KMP Compose recomposition leads: `@Composable`, `remember`, `rememberSaveable`, `derivedStateOf`, `LaunchedEffect`, `DisposableEffect`, `SideEffect`, `produceState`, `snapshotFlow`, `mutableStateOf`, `SnapshotStateList`, stability annotations/config, Compose compiler reports, Compose UI tests, and screenshot tests.
9. Investigation pass:
   - Use summary/enriched search, symbol tools, and targeted file reads to inspect target modules, semantic hotspots, public classes, interfaces, functions, and exported API surface.
   - Apply the SOLID, Clean Code, KISS/YAGNI/DRY and Standing Rules sections of `references/code-quality-lens.md`. Use their Flag-when column here; the Fix-direction column belongs to `workflows/code-quality/code-quality-fix.md` and is not an audit output. Report only what the lens's Split Criterion supports.
   - For Android Jetpack Compose and KMP Compose Multiplatform code, apply recomposition quality checks from `references/mobile-context.md`:
     - Excessive recomposition risk: unstable parameters, mutable collections or mutable models crossing composable boundaries, expensive work in composition, unremembered lambdas/objects, inappropriate `derivedStateOf`, broad state reads, and backwards writes after state reads.
     - Missing recomposition or stale UI risk: non-observable mutation, missing or wrong `remember`/effect keys, stale captured lambdas that need `rememberUpdatedState`, incorrect stability annotations, and risky stability configuration entries that can make UX updates fail to happen.
     - Keep these as `CQ-*` findings only when concrete source evidence ties the pattern to UX jank, stale UI, broken interaction feedback, accessibility/state restoration risk, or maintainability cost.
     - Mark semantic recomposition claims as `suspect` unless supported by Compose compiler stability/skippability reports, existing Compose UI tests, screenshot tests, benchmark/runtime traces, or a clear deterministic static source pattern.
     - Verification suggestions should name the cheapest available sensor: Compose compiler metrics/reports, focused Compose UI test, screenshot/golden test, instrumentation/emulator check, or static lint/build command.
   - For each candidate finding, record the concrete claim, source evidence, impacted maintainability or change-risk flow, provisional severity, and what would disprove it.
10. False-positive pass:
   - Try to disprove every candidate before reporting it.
   - Check framework-required signatures, public SDK or plugin surfaces, ADR-backed extension points, test fixtures/builders, harmless local literals, intentionally tiny adapters, usage evidence, and accepted exceptions.
   - Drop candidates disproven by evidence, downgrade candidates with partial mitigation, and mark judgment-heavy items as `suspect`.
11. Severity rules (apply the countable threshold first, then the qualitative clause):
   - `critical`: quality issue likely causes production outage, data loss, auth/privacy break, OR affects >10 files; otherwise use the qualitative clause below.
   - `high`: strong SOLID/Clean Code/KISS/YAGNI/DRY violation with high change volatility likely to cause major regression, repeated bugs, or high-cost change friction.
   - `medium`: real maintainability issue, speculative surface, duplicated rule, weak naming/comment pattern, or avoidable complexity with localized impact (<=10 affected files).
   - `low`: minor hardening opportunity, low-impact cleanup, incomplete evidence, or weakly supported concern.
12. Final report:
   - Findings first, ordered by severity.
   - Each finding must use `CQ-<N>` and include the canonical fields from `references/audit-report-io.md`: rule, current shape, simplest safe transformation, severity, confidence, file/line, concrete evidence, impact, simplest sufficient fix, and verification suggestion.
   - For Android/KMP Compose recomposition findings, include whether the risk is excessive recomposition or missing/stale recomposition, the affected composable or state boundary, UX impact, confidence, and the deterministic sensor that would prove or disprove the claim.
   - Mark judgment-heavy items as `suspect` instead of fact.
   - Avoid false positives for framework-required signatures, public SDK or plugin surfaces, ADR-backed extension points, test fixtures/builders, harmless local literals, and intentionally tiny adapters.
   - If a candidate turns on domain language, coupling dimensions, or seam placement, do not force it into `CQ-<N>`; list it as skipped architecture scope or recommend `architecture-audit`.
   - If no findings, say what scope was checked and which checks were skipped.
   - Include ruled-out candidates when they were plausible enough to matter.
   - Include scope checked, deterministic evidence or skipped-check notes, memory outcome, and residual risk.
   - Include the Verification/Test Fidelity Checklist from `references/audit-report-io.md`; tie every `CQ-*` finding or no-finding claim to deterministic sensors, commands/artifacts, results, validation assets, or skipped-check reasons. Model judgment alone cannot satisfy verification/testing all-clear.
   - For direct top-level invocation, use the Plan Mode save rule and canonical report contract from `references/audit-report-io.md` for `audits/code-quality/<YYYY-MM-DD code-quality-audit>.md`.
   - For implementation audit child invocation, return compact findings to the parent unless the parent explicitly requests saved audit artifacts.
13. Persist only durable knowledge:
   - Do not persist one-off findings.
   - Persist repeated anti-patterns, project-specific quality rules, accepted exceptions, or repeated overengineering patterns via `remember` after scoring with the Importance Calibration System.
   - Use required tags: `project:<projectId>`, `session:<workflowSessionId>`, `workflow:code-quality-audit`, `entity:<entity>`, and one `memory:<tier>` tag.
14. Complete the Evidence Gate from `references/evidence-gate.md`.
