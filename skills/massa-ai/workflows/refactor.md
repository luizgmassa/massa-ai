---
name: refactor
description: "Behavior-preserving structural cleanup, simplification, decoupling, and testability workflow; route broken behavior to debug and broad boundary redesign to architecture-audit or spec-driven."
license: MIT
metadata:
  version: "1.1.0"
---

### 🔨 Refactor

Use for behavior-preserving structural cleanup, simplification, decoupling, testability improvements, and code organization changes where the intended external behavior stays the same. Not for broken behavior — route to `workflows/debug.md`. Not for broad boundary redesign, migration, or unclear architecture direction — route to `workflows/architecture/architecture-audit.md` or `workflows/spec-driven.md`.

Load `references/project-context.md` (intake sweep) before the first substantive read.

Before the first repository mutation, load `references/implementation-delivery.md` (delivery chain: worktree, atomic commits, PR, CI watch, merge gate) and `references/code-annotation.md` (doc blocks, rationale, test coverage). After two consecutive failed fixes on one symptom, stop editing and load `references/root-cause-scripts.md`.

**Isolation Gate — before the first file edit:** execute `references/implementation-delivery.md` Stage 0–1 now (fetch base, create the worktree + branch, work inside it) and record the worktree path + branch — or one of Stage 1's two legal skip reasons, verbatim — before any repository mutation.

1. Resolve/reuse `workflowSessionId`: `refactor-[entity]`
2. `recall` → load architectural decisions and coupling patterns for the area
3. Load shared references as needed:
   - `references/codebase-investigation.md` before changing unfamiliar code
   - `references/architecture-lenses.md` when the refactor is driven by coupling, seams, adapters, depth, leverage, or locality
   - `references/architecture-deepening-lens.md` and its Interface Design Method when a refactor candidate has two or more viable interface shapes (Design It Twice before choosing)
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
   - Validate each group with the characterization and verification recipe before committing.
   - Invoke `workflows/commit.md` for each verified group; do not duplicate commit staging, message, audit-exclusion, or Jira-prefix rules in this workflow.
   - When every group has a confirmed Jira key, follow the optional stacked branch flow in `references/pr-task-fix.md` (Jira-Key Stacked Branches).
10. Include file-integrity checks when tests, specs, benchmarks, fixtures, or snapshots are validation assets. If verification found a reusable signal (`ac_gap`, `surviving_mutant`, `spec_precision_gap`, `spec_deviation`, `gate_fail`), record it via `references/lessons.md`:
     `bun skills/massa-ai/scripts/lessons.ts --root . add --feature "<slug>" --signal "<signal>" --source "<ref>" --text "<one terse lesson>"`
11. Use `references/agent-orchestration.md` only for isolated implementation slices or independent verification
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

13. Complete the Evidence Gate from `references/evidence-gate.md`
