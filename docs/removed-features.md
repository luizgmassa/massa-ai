# Removed Features

This document records features that were intentionally removed from massa-ai to
narrow scope to a local-first single-user memory platform.

## Commit 5547afc — "chore: remove old docs, and update readme"

**Date**: 2026-03-04
**Rationale**: Scope narrowing to local-first single-user memory platform. The removed
features (multi-tenant, subagents, ADRs) were designed for a different product direction
that was superseded by the local-first architecture.

### Removed documentation

The following docs were deleted (~6000 lines total):

| File | Lines removed | Content |
|------|---------------|---------|
| `docs/01-overview.md` | 137 | Project overview |
| `docs/02-architecture.md` | 370 | Architecture documentation |
| `docs/03-optimization.md` | 545 | Optimization guide |
| `docs/05-implementation.md` | 866 | Implementation details |
| `docs/06-api-reference.md` | 445 | API reference |
| `docs/07-subagents-system.md` | 305 | Subagents system design |
| `docs/08-agent-architect.md` | 236 | Agent architect role |
| `docs/09-agent-implementer.md` | 311 | Agent implementer role |
| `docs/10-agent-optimizer.md` | 365 | Agent optimizer role |
| `docs/11-orchestrator-mistral.md` | 300 | Mistral orchestrator |
| `docs/12-workflow-execution.md` | 363 | Workflow execution guide |
| `docs/13-standalone-architecture.md` | 639 | Standalone architecture |
| `docs/14-multi-tenant-architecture.md` | 1599 | Multi-tenant architecture |
| `docs/15-multi-tenant-examples.md` | 986 | Multi-tenant examples |
| `docs/MULTI-PROVIDER-EMBEDDINGS.md` | 446 | Multi-provider embeddings |
| `COMPLETION_SUMMARY.md` | 254 | Completion summary |

### Removed features (by implication of doc removal)

- **Multi-tenant architecture**: No longer supported. massa-ai is single-user local-first.
- **Subagents system**: Removed. The agent workflow is now driven by the massa-ai skill router.
- **Agent roles (architect/implementer/optimizer/orchestrator)**: Removed. Replaced by the
  persona-router catalog and massa-ai workflow router.
- **Mistral orchestrator**: Removed. LLM calls are now handled by the shared `llm-client.ts`.

### What remains in docs/

- `docs/glr-verification.md` — GLR stack-merge depth verification (Wave 6 M62)
- `docs/path-recovery.md` — Project path recovery (`--recover` flag, Wave 6 N42)
- `docs/adr/0001-remove-d5-cypher-subset.md` — ADR closing D5 Cypher deferral (Wave 7)
- `docs/removed-features.md` — This document
## Agent roster consolidation — personas, 14 sub-agents, 4 workflows

**Date**: 2026-09-23
**Spec**: `.specs/features/agent-roster-consolidation/`
**Rationale**: The harness had three overlapping layers of role routing — a persona
catalog with its own router skill and bootstrap rule, 18 sub-agent charters whose
responsibilities overlapped (three judges, two explorers, five read-only reviewers, two
requirement analysts), and 40 workflows, some niche (`maestro*`), one a catch-all
(`general`). Routing now lives in one place: workflows dispatch a roster of 7 agents,
each merged charter keeping every former output contract behind a capability-packet
`mode`.

### Removed personas

| Removed | Replacement |
|---|---|
| `skills/persona-router/` (router skill) | None — workflows plus sub-agents own role routing |
| `skills/massa-ai/personas/` (catalog + 5 persona prompts) | None |
| `persona-router` bootstrap rule (9 → 8 rules) | None; a persisted `bootstrap.rules["persona-router"]` is silently ignored |
| `persona_router:` policy block, `persona_pin` project contract, `persona` capability-packet field | None |
| `/persona` prompt prefix as an observation-extractor role signal | `act as` / `you are a` still classify as role |

The red-team "adversary personas" in `skills/massa-ai/references/the-fool/` are a critique
technique, not this feature, and stay.

### Removed sub-agents

| Retired agent | Now |
|---|---|
| `investigator`, `navigator` | `code-explorer` (`trace`, `lookup`) |
| `reviewer`, `verification-agent`, `audit-specialist`, `architecture-specialist`, `mobile-specialist` | `code-reviewer` (`review`, `verify`, `audit`, `guide`) |
| `meta-judge`, `plan-critic` | `judge` (`spec-author`, `plan-critique`; `scorer` was `judge`) |
| `furps-analyst`, `requirements-analyst` | `product-manager` (`furps`, `requirements`; plus the `audit` requirements lens) |
| `planner` | None — the dispatching workflow's main agent plans |
| `context-curator` | None — the main agent curates context under the Context Firewall |
| `documentation-agent` | None — the `create-*` workflows produce their documents |

The `massa-ai-` agent-name prefix went with them: agents ship unprefixed, and ownership
moved to the `massa-ai-owned` content marker. Installers prune the legacy
`massa-ai-<name>` files for the 18 pre-consolidation names on upgrade. The mapping table
in `skills/AGENTS.md` is the single current-tense record of this change.

### Removed workflows

| Removed | Reason |
|---|---|
| `general` | A catch-all duplicated the router's Core Contract; with no match the router now proceeds without a workflow file |
| `maestro`, `maestro-audit`, `maestro-fix` (+ `references/maestro.md`, `references/maestro/`, `docs/massa-ai-maestro.md`, the `MST` audit family) | Niche mobile E2E workflows; removed to shrink the workflow surface to what is used |

Six workflows were renamed, not removed, with no aliases: `discovery` →
`product-discovery`, `adr` → `create-adr`, `to-prd` → `create-prd`, `rfc` → `create-rfc`,
`tdd` → `create-tdd`, `ticket` → `create-ticket`.

## Agent roster revision — profile skill

**Date**: 2026-09-23
**Spec**: `.specs/features/agent-roster-revision/`
**Rationale**: The owner no longer wants a dedicated skill front for the model-profile
switch engine (PRO-01..03).

| Removed | Replacement |
|---|---|
| `skills/profile/` (Claude skill front) | None — the MCP tools `profile_list`/`profile_set` and both `massa-ai-config profile` CLIs are the only fronts left |

The switch engine (`packages/shared/src/profile-switch/`), the MCP tools, and the CLIs
are unchanged; only the skill front is gone.

## Agent roster revision — builder renamed to senior-engineer

**Date**: 2026-09-23
**Spec**: `.specs/features/agent-roster-revision/` (REN-01..05)
**Rationale**: `builder` named the agent's write permission, not its seniority or scope,
and read as a build-tool rather than an implementation specialist.

`skills/agents/builder/` moved to `skills/agents/senior-engineer/` with the same one
output contract, the same disjoint-write-set implementation role, and the same charter
identity — no behavior changed. Every dispatch block, registry row, model-profile
override key, and generator constant now names `senior-engineer`. The mapping table in
`skills/AGENTS.md` records `builder → senior-engineer`. A user's model-profile overlay
still keyed under the pre-rename `builder` name keeps applying: the overlay merge maps it
onto `senior-engineer` unless the overlay already sets `senior-engineer` directly.
