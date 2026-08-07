---
name: refactor
description: "Behavior-preserving structural cleanup, simplification, decoupling, and testability workflow; route broken behavior to debug and broad boundary redesign to architecture-audit or spec-driven."
license: MIT
metadata:
  version: "1.3.0"
---

### 🔨 Refactor

Use for behavior-preserving structural cleanup, simplification, decoupling, testability improvements, and code organization changes where the intended external behavior stays the same. Not for broken behavior — route to `workflows/debug.md`. Not for broad boundary redesign, migration, or unclear architecture direction — route to `workflows/architecture/architecture-audit.md` or `workflows/spec-driven.md`.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

**Isolation Gate — before the first file edit:** execute `references/implementation-delivery.md` Stage 0–1 now (fetch base, create the worktree + branch, work inside it) and record the worktree path + branch — or one of Stage 1's two legal skip reasons, verbatim — before any repository mutation.

1. Resolve/reuse `workflowSessionId`: `refactor-[entity]`
**Reuse Scan — before writing new implementation code:** run the mandatory reuse scan per `references/code-reuse-scan.md` (separate read-only subagents; the reuse map's use/extend/new decisions are consumed before new code is planned or written) — or record its inline-fallback reason, verbatim.

2. `recall` → load architectural decisions and coupling patterns for the area
   - Canonical artifact home: Standard+ refactors write to `.specs/refactors/<slug>/` (`CHARACTERIZATION.md` required; `PLAN.md` and `SENSOR.md` optional); Quick-sized refactors reuse `.specs/quick/NNN-slug/` verbatim. If the target directory is unwritable, block the write per `references/artifact-persistence.md`.
3. Load shared references as needed:
   - `references/codebase-investigation.md` before changing unfamiliar code
   - `references/naming-standards.md` before introducing or renaming identifiers, screens, components, attributes, or implementation-facing names (English-conversion rule applies)
   - `references/architecture-lenses.md` when the refactor is driven by coupling, seams, adapters, depth, leverage, or locality
   - `references/architecture-deepening-lens.md` and its Interface Design Method when a refactor candidate has two or more viable interface shapes (Design It Twice before choosing)
   - `references/knowledge-verification-chain.md` when Design It Twice or an architecture-lens library-pattern investigation depends on external library/API behavior not already verified in this session
   - `references/mobile-context.md` when the refactor touches KMP, iOS, Android, native bridges, mobile lifecycle, offline sync, permissions, local persistence, or backend-mobile contracts
   - `references/verification-ladder.md` before Quick/Standard/Spec-driven sizing or edits
   - `references/context-firewall.md` when source inspection or tool output meets its threshold table (a single source/log/doc block >200 lines, >20 KB, or >50 search hits)
   - `references/pr-task-fix.md` when the verification ladder trigger table applies
   - `references/lessons.md` when `.specs/lessons.json` exists, to load confirmed project lessons before refactoring
4. Size the refactor before editing:
   - Use the exact Quick, Standard, and Spec-driven thresholds in `references/verification-ladder.md`.
   - Route boundary redesign to `workflows/architecture/architecture-audit.md`; route Spec-driven threshold work to `workflows/spec-driven.md` or split into atomic tasks.
   - For Standard refactors or Quick refactors over 3 files/200 LOC, load `references/pr-task-fix.md`, run its ADR/TDD input gate, decompose work into Small-first independently buildable PR groups, and keep Medium groups only when splitting would break build, tests, UI, or review coherence.
5. Follow the shared retrieval order from `references/codebase-investigation.md`
   to find related code and usages. Call `impact_analysis` with `project`, `projectPath`, and `scope` to assess the centrality-ranked blast radius of the structural change before editing. `impact_analysis` only counts as evidence when the index is fresh for the current repository path and commit/worktree state; fall back to `search`/`get_references` and record reduced retrieval confidence when the index is stale or unavailable. An empty diff returns an empty impact set (not an error).

**Brownfield Minimum Bar:** when this codebase's `.specs/project/onboarding/` mapping does not already cover the refactor's blast radius, derive the Minimum Bar from `references/brownfield-mapping.md` before establishing current behavior — `TESTING.md` feeds step 6's characterization commands directly, and `CONCERNS.md` drives the PR-group boundaries in step 9 and the discrimination sensor's P0 tiering. Record both under `.specs/project/onboarding/`.

6. Establish current behavior before moving code: tests, exact manual command transcripts, static checks, or artifact inspection
7. For mobile refactors, characterize current bridge/API/platform behavior before moving code:
   - shared vs platform-specific boundary
   - native bridge payload and compatibility expectations
   - impacted and comparison platforms
   - deterministic mobile sensors or skipped platform checks from `references/mobile-context.md`
8. Focus on pragmatic refactoring:
   - Identify over-abstracted code and propose Modular Monoliths
   - Reduce "abstraction cost" to make code more AI-navigable
   - The primary payoff of extraction is extract-for-findability: create a named unit locatable by search or grep from outside the file — that is what makes code AI-navigable, not extraction volume alone
   - Verify changes do not break existing behavior using the verification recipe
9. Execute by PR group when `references/pr-task-fix.md` applies:
   - Order non-breaking groups by Data, Domain, then Presentation/Navigation, mapping those labels to repository boundaries when needed.
   - Validate each group with the characterization and verification recipe before committing, then run the discrimination sensor from `references/discrimination-sensor.md`: mutate the *moved* code (never new code) in scratch and confirm the characterization tests kill it. A surviving mutant becomes a fix task that strengthens the characterization test before that group is marked verified. Tier the group P0 when the moved code touches payment, auth, data-integrity, or public-contract surfaces.
   - Invoke `workflows/commit.md` for each verified group; do not duplicate commit staging, message, audit-exclusion, or Jira-prefix rules in this workflow.
   - When every group has a confirmed Jira key, follow the optional stacked branch flow in `references/pr-task-fix.md` (Jira-Key Stacked Branches).
   - Every PR group from this refactor shares one Stage 3 delivery authorization (`references/implementation-delivery.md`) — one go-ahead covers every group's commits, pushes, and PR creation.
   - Before PR creation, run `bun skills/massa-ai/scripts/check_specs_delivered.ts <slug> --kind refactor` (`--kind quick` for Quick-sized work) — a non-zero exit blocks Propose. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).
10. Include file-integrity checks when tests, specs, benchmarks, fixtures, or snapshots are validation assets. If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
     `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
11. Use `references/agent-orchestration.md` for isolated implementation slices; the verification-agent dispatch below is not discretionary at Standard+ sizing or PR-group execution — that reference's Independent Verification Exception makes it a standing requirement, not a per-task judgment call.
12. At completion, persist (run the scoring rubric from `references/decision-engine.md`):
   - Refactored architectural decisions via `remember` as scored `decision` memories
   - Identified and decoupled anti-patterns via `remember` as scored `pattern` memories

> **Dispatch: `massa-ai-reviewer`** (role: `reviewer`) — charter `skills/agents/reviewer/SKILL.md`
> - trigger: implementation complete, before the verification gate — never optional
> - scope: the change's diff surface and its task/AC context
> - permissions: read-only
> - inputs: diff, acceptance context, recalled code-quality conventions
> - sensors: bugs, regressions, missing edge cases, smells introduced by the diff
> - output: ranked findings, blocking vs advisory; blocking findings become fix items before verification runs
> - firewall: summarized findings only, never raw diff dumps
> - memory: suggest-only; main agent persists
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes review against this output contract and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

> **Dispatch: `massa-ai-verification-agent`** (role: `verification-agent`) — charter `skills/agents/verification-agent/SKILL.md`
> - trigger: Standard+ refactor sizing or any PR-group execution per the Independent Verification Mandate in `references/verification-ladder.md` — mandatory once reviewer fix items are resolved; Quick-sized refactors dispatch only when validation assets were touched, otherwise run the fresh-eyes fallback below and record the skip reason
> - scope: the moved/transformed code across this refactor's PR groups and the characterization tests that must protect it
> - permissions: read-only
> - inputs: the characterization baseline from step 6 (and step 7 for mobile refactors), the diff of moved code per PR group, and the PR-group map from step 9
> - sensors: confirm the characterization tests still pass against the moved code's preserved behavior; discrimination sensor per `references/discrimination-sensor.md` (mutate the moved code — never new code — in scratch, one PR group at a time; characterization tests must kill each mutant)
> - output: a preserved/regressed verdict per PR group and any surviving-mutant findings, written to `.specs/refactors/<slug>/SENSOR.md`
> - firewall: summarized per-group findings only, never raw diff dumps
> - memory: suggest-only; main agent persists refactor verification outcomes
> - fallback: if the subagent is unavailable, run a standalone fresh-eyes re-check of the characterization evidence per PR group and record the skipped-delegation reason
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

- The fix→re-verify cycle for a PR group is capped by the Bounded Fix→Re-verify Loop's 3-iteration limit in `references/verification-ladder.md` (cap reached → `Blocked`); that is distinct from the two-consecutive-failed-fix edit-attempt breaker in `references/root-cause-scripts.md`, which fires on repeated failed edits against one symptom while moving code and neither consumes nor resets the verify-cycle count.

13. Complete the Evidence Gate from `references/evidence-gate.md`

## Failure Handling

- `.specs/refactors/<slug>/` unwritable: block the write per `references/artifact-persistence.md`; do not fall back to memory or chat as the record of characterization evidence.
- Discrimination sensor mutation not safely reversible: mark the claim `Blocked` unless equivalent existing deterministic mutation evidence already proves the characterization tests discriminate for that moved code.

<!-- validator anchors: massa-ai-verification-agent dispatch block; Independent Verification Mandate; Independent Verification Exception; discrimination sensor mutate the moved code; characterization tests must kill it; P0 payment/auth/data-integrity/public-contract; .specs/refactors/<slug>/CHARACTERIZATION.md; .specs/refactors/<slug>/SENSOR.md; check_specs_delivered.ts --kind refactor; check_specs_delivered.ts --kind quick; graceful degradation preserved; Stage 3 delivery authorization; Bounded Fix→Re-verify Loop; two-consecutive-failed-fix edit-attempt breaker; Brownfield Minimum Bar; knowledge-verification-chain.md -->

