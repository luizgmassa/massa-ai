# Discovery Workflow Design

Slug: `discovery-workflow` · Session: `spec-discovery-workflow`

## Design Summary

One new prose file (`skills/massa-ai/workflows/discovery.md`) adapted from
the user-supplied product-brainstorming document, one router registration in
`skills/massa-ai/SKILL.md`, two count-lock integer edits, one CHANGELOG
entry, bundle regeneration. No code, no new references, no roster change.
The workflow is a read-only conversation route: four brainstorming modes,
seven frameworks-as-tools, the Frame→Diverge→Provoke→Converge→Capture
rhythm, the thinking-partner conduct contract, massa-ai session/memory
binding, and a mandatory end-of-session `to-prd` handoff offer. Mirrors the
pr-review-workflow delivery shape exactly (freshest precedent, same gate
surfaces, T1–T5 green there).

## Tech Decisions

### D1 — Content compression map (source 274 lines → workflow file)

Kept, compressed to massa-ai workflow prose: all four modes (their
"useful questions" lists trimmed to the strongest 2–3 each); all seven
frameworks (HMW structure+levels, JTBD structure+fired/hired probe, OST as a
4-line tree sketch + evidence rule, First Principles as the 4-step loop,
SCAMPER as a one-line-per-lens list, OODA as the 4 steps + when-to-use in
product terms, Reverse Brainstorming as the 4-step inversion); the five-stage
session rhythm with Capture's output list verbatim-adapted; the full Do /
Do-Not conduct lists; all six anti-patterns with counters. Cut: the long OODA
strategy digression, duplicated examples, and the generic "Session Structure"
prose that repeats mode guidance. Rationale: the workflow file is loaded into
context on route — target ≤ ~14 KB, comparable to pr-review.md's 17.4 KB
and well under any suite ceiling; unique prose, so the duplication metric is
untouched.

### D2 — Read-only complement membership

Discovery never mutates the repository; it joins the 24-strong read-only
complement. It must not reference `implementation-delivery.md`,
`code-annotation.md`, or `root-cause-scripts.md` (delivery-scope gate asserts
the leak direction explicitly). Runtime artifact writes: none — the PRD
belongs to `to-prd`; `.specs/` stays untouched by discovery sessions.

### D3 — Router row + precedence wording under the byte ceiling

Row before `to-prd` (flow adjacency: discovery feeds to-prd):
`| `discovery` | product brainstorming / problem-space thinking partner | `workflows/discovery.md` |`
Precedence lands in tier 4 (primary verb): brainstorm/explore a product
problem, idea, or direction with no concrete code target → `discovery`;
inspect/understand the codebase stays `exploration`. Tier 4, not tier 2:
there is no requested artifact — when the user asks for the PRD artifact
itself, tier 2 already routes `to-prd`. Budget: SKILL.md is 20,091 B of
21,000; the row + clause are authored ≤ ~350 B combined, measured at T2.

### D4 — to-prd handoff contract

The offer is a mandatory Capture-stage step, not an auto-run: `to-prd`'s own
description requires explicit user request, and the user accepting the offer
is that explicit request. On acceptance the conversation routes to
`workflows/to-prd.md` with existing context (to-prd's no-new-interview rule
holds — discovery already did the questioning). On declination the capture
summary stays in conversation and durable decisions persist per D6. The
workflow states all three branches (offer, accept, decline).

### D5 — Provenance without invented attribution

The base document is user-supplied with no license/attribution header. The
workflow records "adapted from a user-supplied product-brainstorming skill
document (2026-08-05)" and ships MIT like the other 38 workflows. Contrast
pr-review (CC-BY-4.0 with named upstream): no upstream is known here, and
inventing one would be worse than recording the true provenance.

### D6 — Memory capture policy

Capture persists only durable, session-transcending knowledge via
`remember`: chosen directions and their why (`decision`), rejected
directions with reasons (`decision`), reusable framings/insights
(`pattern`) — required tags `project:<id>`, `session:discovery-<entity>`,
`workflow:discovery`, `entity:<name>`, plus a memory-tier tag. Start-of-
session `recall` uses the router's budget (limit ≤ 3, minImportance ≥ 0.7,
types critical/decision/pattern). MCP unavailable → skip both silently-
degrading, capture stays in conversation (measured this session: recall
aborted after 120 s; the degradation path is live, not theoretical).

## Risks & Concerns

- R1 SKILL.md byte ceiling: 909 B headroom; row + clause budgeted ≤ 350 B,
  measured at T2 before commit. Mitigation: terse row wording.
- R2 Routing collision: "explore" appears in both discovery and exploration
  vocabulary. Mitigation: clause keys on product problem/idea/direction with
  no concrete code target vs. codebase understanding; `exploration` retains
  its explicit read-only-codebase meaning; tier 1 explicit naming always
  wins.
- R3 Stacked branch: if pr-review-workflow is reworked in review, this
  branch inherits the churn. Accepted (spec A1) — the alternative
  (from-main) guarantees three-surface conflicts instead.
- R4 Count-lock churn: T3 edits the same two literals pr-review just
  touched (39→40, 23→24). Observed-red ordering proves the sensors see the
  new file.
- R5 Base document is itself a skill prompt: risk of shipping second-person
  skill voice that clashes with workflow conventions. Mitigation: D1
  rewrites into workflow imperative voice; WMH frontmatter + integrity
  suites gate the format.
