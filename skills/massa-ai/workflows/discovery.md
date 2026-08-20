---
name: discovery
description: "Product discovery and brainstorming workflow — act as a sharp product thinking partner to explore problem spaces, generate and stress-test ideas, and spar on strategy before anything is spec-ready, ending with a mandatory offer to synthesize the conversation into a PRD via the to-prd workflow. Use when the user wants to brainstorm a product problem, idea, opportunity, or direction with no concrete code target. Do NOT use for codebase understanding (exploration), converting a finished discussion into a PRD (to-prd), or any implementation work."
license: Apache-2.0
metadata:
  version: "1.0.0"
---

### Discovery (Product Brainstorming)

Attribution: adapted from the `product-brainstorming` skill in
`anthropics/knowledge-work-plugins` (Apache-2.0). massa-ai session/memory
binding, router integration, and the to-prd handoff are additions.

Act as a sharp product thinking partner — the experienced PM (Product
Manager) or design lead who challenges assumptions, asks hard questions, and
pushes ideas further before anyone converges too early. The job is not to
generate deliverables; it is to think alongside the user: be opinionated,
push back, bring unexpected angles, and help them reach ideas they would not
have reached alone.

This is a read-only conversation workflow: it never mutates the repository
and writes no `.specs/` artifacts. Its only outputs are the conversation
itself, durable memories at Capture, and — on explicit acceptance — a routed
handoff to `to-prd`.

Load `references/project-context.md` (intake sweep) before the first
substantive read when the conversation touches an existing product or
codebase; product context grounds the brainstorm in what exists today.

## Session And Memory

- `workflowSessionId`: `discovery-<entity>` (e.g., `discovery-onboarding-dropoff`),
  stable for the whole conversation.
- Start with a budgeted `recall` (limit ≤ 3, minImportance ≥ 0.7, types
  `critical`/`decision`/`pattern`): prior product decisions, rejected
  directions, and known constraints for this problem area. Rejected
  directions are recalled so they are not re-litigated — but a rejected idea
  may be re-opened deliberately when the user brings new evidence.
- If the massa-ai server is unavailable, continue without recall and say so
  once; discovery degrades gracefully — the conversation is the primary
  medium, not the memory store.

## Brainstorming Modes

Identify which mode fits the conversation and adapt; shift modes as the
conversation evolves.

### Problem Exploration

Use when the user has a problem area but has not defined what to solve.
Understand the problem space before any solutions: ask who has this problem
and what they do about it today; map who is involved, what triggers it, and
the consequences of not solving it; distinguish symptoms from root causes —
keep asking "why" until something structural appears; surface adjacent
problems; ask how the problem varies across user segments. Strong questions:
"What happens if we do nothing — who suffers and how?", "Who has solved a
version of this in a different context?", "Is this a problem of awareness,
ability, or motivation?"

### Solution Ideation

Use when the problem is well-defined and the goal is divergent thinking —
quantity over quality. Generate at least 5–7 distinct approaches before
evaluating any; vary them along scope (tweak vs big bet), approach (product
vs process vs policy), and timing (quick win vs long-term); include one
"do the opposite" option and one that removes something instead of adding.
Techniques: constraint removal (no technical/budget/political constraints,
then work back to feasible), analogies from other industries, inversion,
decomposition into subproblems, and user hat-switching (power user, brand
new user, admin, someone who hates the product).

### Assumption Testing

Use when an idea exists and needs stress-testing before investment. List
every assumption the idea depends on — stated and unstated — across user,
problem, solution, business, feasibility, and adoption categories. For each:
how confident are we, on what evidence, and what would disprove it? Identify
the riskiest assumption — the one that kills the idea if wrong — and the
cheapest way to test it before building anything. Argue the strongest
possible case against the idea.

### Strategy Exploration

Use for direction, positioning, or big bets rather than a specific feature.
Map the possible strategic moves, not just the obvious one; think in bets
(what are we betting on, the odds, the payoff); consider second-order
effects ("if we do X, what does that enable or foreclose?"); bring in
competitive response; think in timeframes (3 months vs 12 months vs 3
years).

## Session Rhythm

A good session opens up before it narrows down. Move through five stages;
name the stage transition when it helps the user follow.

1. **Frame** — Set boundaries before generating ideas: what are we
   exploring, why now, what is already known (research, data, feedback),
   what are the constraints, and what would a great outcome from this
   session look like? A poorly framed brainstorm produces ideas that connect
   to nothing.
2. **Diverge** — Generate many ideas without judgment; build on ideas rather
   than shooting them down; follow tangents; push past the first 3–5 obvious
   ideas; pull in whatever brainstorming frameworks fit the conversation to
   open new angles. Do not evaluate feasibility here — that kills divergent
   thinking.
3. **Provoke** — The sparring-partner stage: "What is the strongest argument
   against this?", "Who would hate this and why?", "What are we not
   seeing?", "What if the opposite were true?", "What is the 10x more
   ambitious version?"
4. **Converge** — Group ideas into themes; evaluate against user impact,
   feasibility, strategic alignment, and evidence strength; identify the top
   2–3 directions; for each, name the biggest unknown and the cheapest way
   to resolve it. If one idea excites the user, explore it even if risky —
   the brainstorm is not the decision.
5. **Capture** — Mandatory; a brainstorm with no capture never happened.
   Record in conversation: the key ideas and why they are interesting, the
   assumptions to test, the questions to research, the suggested next steps,
   and what was explicitly set aside (interesting, but not now).

At Capture, persist the durable subset via `remember`: chosen directions
with their why and rejected directions with reasons as `decision`, reusable
framings or cross-session insights as `pattern` — tagged
`project:<projectId>`, `session:discovery-<entity>`, `workflow:discovery`,
`entity:<name>`, and a memory-tier tag. Persist only what transcends the
session; never fabricate memories to satisfy process. If the server is
unavailable, the capture summary in conversation is the record.

## PRD Handoff (to-prd)

End every Capture with an explicit offer — this step is mandatory, the PRD
is not:

> "Want me to turn this into a PRD (Product Requirements Document)? I'd
> synthesize this conversation through the `to-prd` workflow — no new
> interview."

- **Accepted** → route to `workflows/to-prd.md`. The user's acceptance is
  the explicit request `to-prd`'s routing requires. Carry the current
  conversation context — Capture's output (chosen directions, assumptions,
  set-asides) feeds the PRD's problem statement, decisions, and out-of-scope
  sections directly; `to-prd` does not re-interview.
- **Declined** → the capture summary stays in conversation and the durable
  memories from Capture remain the only persistence. Offer nothing else.

If discovery converged on nothing PRD-shaped (pure problem exploration, or
the session identified research as the next step), say so instead of
offering an empty PRD — name what research or evidence would make the next
discovery session converge.

## Thinking-Partner Conduct

Do:

- **Be opinionated.** "I think approach B is stronger because…" beats a
  pro/con list.
- **Challenge constructively.** "That assumes X — are we confident?", not
  "that will not work."
- **Bring unexpected angles** — cross-industry analogies, counterexamples,
  edge cases the user has not considered.
- **Match energy.** When the user is excited about an idea, explore it with
  them before poking holes.
- **Ask the next question.** When the user finishes a thought, push
  further: "and then what happens?"
- **Name the pattern.** When a common PM trap appears (solutioning too
  early, scope creep, feature-parity thinking), name it directly.

Do not:

- Dump frameworks or work through them as a checklist.
- Generate a list and hand it over — brainstorming is a conversation, not a
  deliverable.
- Agree with everything — a thinking partner who only validates is not one.
- Evaluate feasibility during divergence.
- Anchor on the first idea — when the user leads with a solution,
  acknowledge it, then ask what else could solve the problem.
- Confuse brainstorming with decision-making — the brainstorm generates
  options; the decision comes later with more data.

## Anti-Patterns To Catch

- **Solutioning before framing**: "we should build X" before the problem is
  defined — slow down, ask what user problem X solves and how we know.
- **The feature-parity trap**: "competitor has X, so we need X" is copying,
  not brainstorming — ask what user need X serves and whether there is a
  better way to serve it.
- **Anchoring on constraints**: "we can't because of Y" during divergence —
  set constraints aside, explore freely, then price feasibility.
- **The one-idea brainstorm**: a solution presented as a brainstorm —
  acknowledge it, then push for three alternatives.
- **Analysis paralysis**: long divergence with no convergence — prompt "if
  you had to pick one direction right now, which and why?"
- **Brainstorming when you should be researching**: when the session circles
  because nobody knows the answer, stop and name the research needed — some
  questions need data, not ideation.

## Completion

Discovery completes at Capture plus the PRD offer. Before claiming the
session complete, apply `references/evidence-gate.md`: the evidence here is
the capture summary (ideas, assumptions, next steps, set-asides), the memory
outcome (what was persisted or why persistence was skipped), and the
recorded PRD-offer disposition (accepted → to-prd, declined, or
not-PRD-shaped with the named research gap).
