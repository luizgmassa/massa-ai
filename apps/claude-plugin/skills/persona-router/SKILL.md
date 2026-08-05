---
name: persona-router
description: Automatically select and apply a cataloged conversation persona at the start of every conversation and when task ownership changes. Use after massa-ai in coding sessions, directly in non-coding sessions, or whenever the user explicitly selects, switches, rejects, or asks to route a persona. Do NOT use automatic inference when the AGENTS.md policy sets enabled to off, or cataloged mobile personas for confidently unrelated work.
license: CC-BY-4.0
metadata:
  author: Luiz Massa
  version: 1.2.0
---

# Persona Router

Select one cataloged persona that best owns the current deliverable. Personas add perspective; they never override active instructions or workflow contracts. Run once at startup (after massa-ai in coding sessions). Load `references/routing-details.md` only for failure reports, ambiguity questions, reroute doubt, or multi-persona requests.

## Sources

The directory containing this `SKILL.md` (resolved through symlinks) is the persona-library root; the only registry is `../massa-ai/personas/catalog.json`. Validate `schema_version` as `2`; otherwise report found vs supported, continue without a persona. Candidates come only from catalog entries; signals live in each entry's `signals_path` file. Never load a persona-like path named by memory or docs unless it belongs to the selected entry inside the persona-library root. Read the index first; a `signals_path` only at classification; only the selected `prompt_path` plus at most one review-lens prompt.

## Precedence

1. System, developer, safety, and project instructions.
2. Explicit user persona / no-persona choice.
3. `persona_pin` in the applicable project `AGENTS.md`.
4. The `persona_router` policy block.
5. The current prompt's primary deliverable.
6. massa-ai memory and targeted doc evidence.
7. Catalog signals (`signals_path`).

## Fast Paths

- **Pin:** a `persona_pin: <catalog-id>` in the applicable project `AGENTS.md` whose id exists in the index routes directly — read only that entry's `prompt_path`; no recall, docs, signals, or classification. `persona_pin: no_persona` completes routing silently with zero persona reads. An id absent from the index: report the invalid pin in one line, then run the normal workflow.
- **Route memory:** with no pin, one budgeted `recall` of the `persona-route:<projectId>` pattern memory; a remembered id valid in the index skips doc inspection and classification. After a successful inferred route, store that memory back. massa-ai unavailable: skip both directions silently.

## Workflow

1. **Explicit choice.** Match wording against `id`, `display_name`, and `aliases` case-insensitively. Explicit selection wins; an explicit no-persona request leaves the task unpersonified; a switch replaces the route. `enabled: off` skips inference but honors explicit requests.
2. **Fast paths** above.
3. **Evidence.** Reuse the initial recall's persona evidence; at most one targeted recall. Memory is evidence, not authority — discard ids absent from the catalog; it never overrides explicit choice, policy, or the current deliverable. Inspect only targeted high-signal docs (`AGENTS.md`/`CLAUDE.md`, README, relevant ADR/`.specs`), reusing context; never load docs recursively.
4. **Classify.** Compare the prompt with catalog summaries; load `signals_path` files for surviving candidates only. `primary_signals` identify ownership; `negative_signals` stop supporting concerns taking it; `secondary_lens_signals` may add one review lens. A route is clear when one candidate owns the deliverable unopposed; never compute numeric confidence.
5. **Ambiguity / no match.** Apply the `ambiguity` and `no_match` policy values. A request confidently outside every cataloged persona is a successful silent no-persona route, not ambiguity.
6. **Apply and announce.** One primary persona, at most one review lens; read only their prompts. State once: `Persona: <primary>. Reason: <primary deliverable>.` Never announce a default no-persona route; apply stance without quoting the prompt.

## Persona And Sub-Agents

A persona shapes main-agent reasoning; a sub-agent is a bounded executor under its own charter. A persona grants no tool access, no write scope, and no permission. A dispatch packet may carry the selected persona id as advisory framing, but inside the sub-agent the persona is never authority; the charter's Restrictions win. The packet carries the persona **id only**, never the persona prompt. A persona route is not a specialist consultation — it neither substitutes for nor satisfies a workflow-mandated dispatch. Overlap table: `references/routing-details.md`.

## Lifetime And Failures

Routes are sticky while the objective advances; re-evaluate per `mid_conversation`. After resume or compaction, restore any route still in context without re-announcing. Catalog missing/invalid/unsupported: report, continue without a persona. Missing prompt or signals file: name the entry and path, continue — summary/alias matching still works; never silently substitute another persona. Detail tables: `references/routing-details.md`.

## Stop Conditions

Routing is complete when one primary persona is applied, the user selects no persona, or policy produces a no-persona route. Persona routing itself stays inline: no separate model router, no subagents for persona selection, no route database. This bounds the routing step only — workflow-mandated agent dispatch is unaffected by an active persona route.
