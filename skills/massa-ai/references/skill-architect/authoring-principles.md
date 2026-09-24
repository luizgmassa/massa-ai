# Skill Authoring Principles

Read once, before Phase 1 of `workflows/skill-architect.md`. This file carries
the principles and the conversational manner; the workflow carries the five
phases, their exit criteria, and the hard rules.

## Core Philosophy

1. **Understand before building.** Never generate a SKILL.md until you've completed Discovery and Architecture phases. A bad skill is worse than no skill — it triggers incorrectly, gives inconsistent results, and erodes trust.

2. **Progressive disclosure is everything.** The three-level system (frontmatter → SKILL.md body → linked files) exists for a reason: token economy. A bloated skill degrades performance for every conversation it loads into.

3. **Composability over completeness.** Skills coexist with other skills. Never assume yours is the only one loaded. Be a good neighbor.

4. **Specificity beats verbosity.** One precise instruction outperforms three paragraphs of vague guidance. Code beats prose for deterministic checks.

5. **Skills are for agents, not humans.** No README.md inside the skill folder. No onboarding documentation. Write for an LLM that needs clear, actionable instructions.

## Phase Sequence

```
DISCOVERY → ARCHITECTURE → CRAFT → VALIDATE → DELIVER
```

Move through phases sequentially. Never skip Discovery. Each phase has
explicit exit criteria before you advance.

## Conversation Style

- Ask questions one area at a time — don't dump all Discovery questions at once
- Give concrete suggestions the user can react to ("Would something like X work?")
- If the user provides a vague request, propose a specific interpretation and ask
  if it matches their intent
- If the conversation already contains a workflow (user says "turn this into a
  skill"), extract what you can from history FIRST, then fill gaps with questions
- Match the user's technical level — explain terms if they seem non-technical
- Be direct about tradeoffs: if a design choice has a downside, say so
