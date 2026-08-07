# Code Reuse Scan

Load before planning or writing new implementation code in any of the 16
implementation workflows. The mandate is one uniform action line per
workflow; this file is its single normative copy.

## Why

Duplicated components, helper methods, use cases, and repositories ship
undetected when an agent writes new code without first checking what already
exists. A scan run in a separate subagent, before the plan commits to new
code, catches reuse opportunities the main agent's own context would miss or
rationalize away.

## Scan Targets

The scan covers existing:

- Components (UI or domain).
- Helper methods and utility functions.
- Classes and modules.
- Use cases and application services.
- Repositories and data-access adapters.
- Business logic already implementing the same or adjacent rule.
- Similar reusable elements evidenced by the codebase (validators, mappers,
  formatters, fixtures, or comparable structural roles).

## Dispatch

Run the scan in one or more separate read-only subagents before new
implementation code is planned or written:

> **Dispatch: `massa-ai-investigator`** (role: `investigator`) — charter `skills/agents/investigator/SKILL.md`
> - trigger: planning or writing new implementation code in any of the 16 implementation workflows — mandatory, not optional
> - scope: the target feature/module area — candidate existing components, helpers, classes, use cases, repositories, and business logic that could satisfy or overlap the new work
> - permissions: read-only
> - inputs: the task's acceptance criteria or requirement, recalled patterns, the closest entry point into the target area
> - sensors: progressive disclosure (project map → summary search → enriched search → symbol/file tools → optimized context → focused shell); per-candidate reuse-vs-new comparison
> - output: the reuse map (below), evidence-or-zero when nothing reusable is found
> - firewall: summarized candidates and pointers only, never raw file dumps
> - memory: suggest-only; main agent persists durable reuse findings
> - persona: optional — the active route's cataloged id only, never the persona prompt, passed as advisory framing only — it never overrides the agent's charter Restrictions, scope, or permissions; omit when no persona is routed

Dispatch one subagent per coherent target area; dispatch more than one only
when the areas are independent enough to scope separately. The subagent
never spawns further subagents.

## Reuse-Map Output Contract

The scan's output is a reuse map: one row per candidate element.

| Candidate element | Location | Decision |
| --- | --- | --- |
| name/role of the existing element | `path:line` or `path` pointer | `use` \| `extend` \| `new` |

- `use` — the existing element already satisfies the need; call/import it,
  do not duplicate it.
- `extend` — the existing element is the right owner but needs a scoped
  change; extend it instead of adding a parallel implementation.
- `new` — no existing element fits; new code is justified, and the map
  records why the closest candidates were rejected.

**Evidence-or-zero:** if the scan finds no reusable elements, the reuse map
records that explicitly — an empty result is a row stating "no reusable
elements found for `<area>`", never an omitted section.

The reuse map is consumed before new code is planned or written. In
spec-driven, the map feeds Design and Tasks and is not re-run per task unless
a task introduces a new code area.

## Inline Fallback

If subagent spawning is unavailable (forbidden, plugin missing, unknown agent
type), run the scan inline in the main agent against the same scan targets
and the same reuse-map output contract, and record the skipped-delegation
reason. Do not skip the scan because delegation is unavailable.
