---
name: feature
description: "Use this workflow to add a new capability, screen, command, integration, or user-facing improvement with clear intent; route broken behavior to debug and broad work to spec-driven."
license: MIT
metadata:
  version: "1.3.0"
---

### 🟡 Feature

Use when the user wants to add a new capability, screen, command, integration, behavior, or user-facing improvement with clear intent or acceptance criteria. Not for broken behavior — route to `workflows/debug.md`. Not for broad, ambiguous, migration-heavy, or cross-boundary work — route to `workflows/spec-driven.md`.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

**Isolation Gate — before the first file edit:** execute `references/implementation-delivery.md` Stage 0–1 now (fetch base, create the worktree + branch, work inside it) and record the worktree path + branch — or one of Stage 1's two legal skip reasons, verbatim — before any repository mutation.

1. Resolve/reuse `projectId` and `workflowSessionId` (`feature-[entity]`)
**Reuse Scan — before writing new implementation code:** run the mandatory reuse scan per `references/code-reuse-scan.md` (separate read-only subagents; the reuse map's use/extend/new decisions are consumed before new code is planned or written) — or record its inline-fallback reason, verbatim.

2. `recall` → load prior decisions and patterns for this area
   - Use the default recall budget: `limit <= 3`, `minImportance >= 0.7`, and `types=["critical","decision","pattern"]` unless the feature needs broader memory discovery.
   - Recall is context only and must not load or reconstruct canonical artifact state.
3. Load shared references as needed:
   - `references/codebase-investigation.md` when the target area is unfamiliar
   - `references/mobile-context.md` when the feature touches KMP, iOS, Android, native bridges, mobile lifecycle, offline sync, permissions, push/background behavior, local persistence, or backend-mobile contracts
   - `references/verification-ladder.md` before Quick/Standard/Spec-driven sizing or edits
   - `references/context-firewall.md` when source, logs, docs, or tool output meets its threshold table (a single source/log/doc block >200 lines, >20 KB, or >50 search hits)
   - `references/naming-standards.md` before writing or renaming code identifiers, public contract fields, tests, fixtures, or implementation-facing design names
   - `references/pr-task-fix.md` when the verification ladder trigger table applies
   - `references/lessons.md` when `.specs/lessons.json` exists, to load confirmed project lessons before sizing
   - `references/knowledge-verification-chain.md` when the feature depends on an external library or API whose behavior is not already established from this codebase, running the 5-step chain (codebase → project docs → Context7 → web → flag-uncertain) before relying on that dependency's behavior
   - `references/brownfield-mapping.md` (Minimum Bar only — CONCERNS.md + TESTING.md) when the feature touches an area this codebase does not already document; the full onboarding need stays the existing route-to-`workflows/spec-driven.md` boundary stated above for broad, ambiguous, or cross-boundary work, not a new escalation here
4. For Android, iOS, KMP Compose Multiplatform UI, or work whose target matches the enumerated mobile-context trigger set (KMP, iOS, Android, native bridges, mobile lifecycle, offline/sync, permissions, push/background behavior, local persistence, or backend-mobile contracts), run the design-source intake gate from `references/mobile-context.md` (Design-Source Intake Gate) before implementation.
5. Size the task before implementation:
   - Use the exact Quick, Standard, and Spec-driven thresholds in `references/verification-ladder.md`.
   - Low-risk feature plans use the Plan Challenge lite gate first; full The Fool is reserved for explicit challenge, high-risk domains, broad changes, or lite escalation.
   - For Standard work or Quick work over 3 files/200 LOC, load `references/pr-task-fix.md`, run its ADR/TDD input gate, decompose work into Small-first independently buildable PR groups, and keep Medium groups only when splitting would break build, tests, UI, or review coherence.
6. Follow the shared retrieval order from `references/codebase-investigation.md`
   to find related code; pass only `synapseSessionId` to
   `search.sessionId`. For multi-search investigations, run the Synapse task envelope per `references/synapse-policy.md`: `synapse_task_begin` before the first search, `synapse_prefetch` on deep file open, `synapse_task_end` at completion (both `task` calls require an existing `synapse_session` id).
7. Follow existing patterns discovered from recall
8. Establish the verification recipe before Standard edits and before Quick edits that touch validation assets, including file-integrity checks for tests, specs, benchmarks, fixtures, and snapshots used as validation assets
   - Include a focused naming review when the feature introduces or renames identifiers. New names should use domain or precise role vocabulary, and public/persisted names should not change without explicit compatibility handling.
9. For mobile features, capture the mobile context packet, choose shared vs platform-specific boundaries, state platform parity expectations, and include the cheapest relevant mobile verification sensor from `references/mobile-context.md`
10. Use `references/agent-orchestration.md` for isolated implementation slices; independent verification is not merely an optional signal-improving choice here — the Independent Verification Exception in that reference mandates a separate verifier at Standard tier and above (dispatch block after PR-group implementation, below)
11. Capture 1-5 testable acceptance criteria in the conversation before implementation starts, or reference an existing spec artifact (e.g. `.specs/features/<slug>/spec.md`) when one already states them. These captured acceptance criteria are the anchor the verification step below checks outcomes against. Persist them per tier per `references/artifact-persistence.md`: Quick work writes `.specs/quick/NNN-slug/TASK.md` (plus `SUMMARY.md` at completion); Standard tier and above write `.specs/features/<slug>/spec.md` and, once verified, `validation.md`, reusing spec-driven's shape so `validate_state.ts` and the delivery Stage 3.5 gate work unmodified. An unwritable artifact location blocks the workflow rather than proceeding silently.
12. Implement the feature by PR group when `references/pr-task-fix.md` applies:
   - Order non-breaking groups by Data, Domain, then Presentation/Navigation, mapping those labels to repository boundaries when needed.
   - Validate each group with the verification recipe before committing.
   - Invoke `workflows/commit.md` for each verified group; do not duplicate commit staging, message, audit-exclusion, or Jira-prefix rules in this workflow.
   - When every group has a confirmed Jira key, follow the optional stacked branch flow in `references/pr-task-fix.md` (Jira-Key Stacked Branches).
   - All PR groups decomposed under this feature share one feature-level delivery go-ahead: no individual group seeks or receives its own Stage 3 sign-off — see `references/implementation-delivery.md` Stage 3.

> **Dispatch: `massa-ai-reviewer`** (role: `reviewer`) — charter `skills/agents/reviewer/SKILL.md`
> - trigger: implementation complete, before the verification gate — never optional
> - scope: the feature's diff surface and its task/AC context
> - permissions: read-only
> - inputs: diff, acceptance context, recalled code-quality conventions
> - sensors: bugs, regressions, missing edge cases, smells introduced by the diff
> - output: ranked findings, blocking vs advisory; blocking findings become fix items before verification runs
> - firewall: summarized findings only, never raw diff dumps
> - memory: suggest-only; main agent persists
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes review against this output contract and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

> **Dispatch: `massa-ai-verification-agent`** (role: `verification-agent`) — charter `skills/agents/verification-agent/SKILL.md`
> - trigger: Standard tier or above per the Independent Verification Mandate in `references/verification-ladder.md` — mandatory once every implemented PR group has cleared reviewer fix items; Quick tier substitutes the fallback below
> - scope: the new code landed across this feature's PR groups from step 12, plus the tests and validation assets those groups touch
> - permissions: read-only
> - inputs: the 1-5 acceptance criteria captured in step 11 (or the referenced spec artifact) as the outcome source, the feature's diff surface across all PR groups, and its test suite
> - sensors: check the diff and tests against each acceptance criterion; discrimination sensor per `references/discrimination-sensor.md` (mutate the feature's new code, one PR group at a time — covering tests must kill each mutant or that group is not verified)
> - output: a pass/fail verdict per acceptance criterion, any surviving-mutant findings, and an overall verified/blocked verdict per PR group
> - firewall: summarized per-AC and per-mutant findings only, never raw diff dumps
> - memory: suggest-only; main agent persists feature verification outcomes
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes re-check of each AC against the diff and tests, and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

If verification fails, bound the retry with the Bounded Fix→Re-verify Loop cap from `references/verification-ladder.md`: at most 3 fix→re-verify iterations on the same PR group before reporting `Blocked`. This cap governs the post-implementation review/verify cycle and is distinct from the two-consecutive-failed-fixes trigger earlier in this file that loads `references/root-cause-scripts.md`, which fires on repeated failed attempts to fix one symptom during implementation itself.

13. Run the verification recipe and check outcomes against the captured acceptance criteria from step 11, not only against a generic verification recipe; report skipped checks explicitly. At Standard tier and above, back this with `bun skills/massa-ai/scripts/validate_state.ts <slug>` against the persisted `validation.md` — it must be real, report `PASS`, and cite `file:line` evidence per acceptance criterion. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved). If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
     `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
14. At completion, persist (run the scoring rubric from `references/decision-engine.md` for each):
   - Design decisions made via `remember` as scored `decision` memories
   - New patterns introduced via `remember` as scored `pattern` memories
   - Trade-offs accepted via `remember` as scored `conversation` memories
15. Complete the Evidence Gate from `references/evidence-gate.md`

<!-- validator anchors: massa-ai-verification-agent dispatch block; Independent Verification Mandate (Standard tier and above); Bounded Fix→Re-verify Loop cap (3 iterations); validate_state.ts <slug> deterministic backing; graceful degradation preserved; .specs/quick/NNN-slug/TASK.md and SUMMARY.md; .specs/features/<slug>/spec.md and validation.md; one feature-level delivery go-ahead across PR groups -->

