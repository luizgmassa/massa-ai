# Discovery Workflow Specification

Slug: `discovery-workflow` · Session: `spec-discovery-workflow` · Workflow: spec-driven
(Medium/Large — full artifacts by pr-review-workflow precedent) · Branch:
`spec/discovery-workflow` stacked on `spec/pr-review-workflow` @ `975a020d`.

Source base: `/Users/luizmassa/Downloads/product-brainstorming.md` — a user-supplied
product-brainstorming skill document (frontmatter name `product-brainstorming`,
no license or attribution header; read in full 2026-08-05, 274 lines).

## Problem Statement

massa-ai routes every conversation through a workflow, but has no route for
pre-spec product thinking: exploring a problem space, generating and
stress-testing ideas, or sparring on strategy before anything is concrete
enough for `to-prd`, `spec-driven`, or `feature`. Today that conversation
either lands in `general` (which is an implementation workflow carrying the
delivery contract) or `exploration` (which is codebase understanding, not
product thinking). The user wants a `discovery` workflow — a structured
thinking-partner mode adapted from the supplied product-brainstorming
document — that ends by proposing to synthesize the conversation into a
PRD (Product Requirements Document) through the existing `to-prd` workflow.

## Out of Scope

- No new sub-agent charter, MCP tool, REST route, or generator change.
- No change to `to-prd` itself — discovery hands off to it as it exists.
- No `.specs/` artifact writes by the discovery workflow at runtime (the PRD,
  if accepted, is `to-prd`'s output; discovery is a conversation workflow).
- No new reference files under `references/` — the workflow file is
  self-contained.
- No installer, plugin-manifest, or host-config change (ships with the
  existing generated skills bundles).
- No PRD template duplication — the template stays owned by `to-prd`.

## Assumptions & Open Questions

- A1 (accepted): branch is stacked on `spec/pr-review-workflow` @ `975a020d`
  rather than origin/main — both features edit the same three contended
  surfaces (SKILL.md router table, two count-lock tests, CHANGELOG); stacking
  makes the count locks 39→40 monotonic instead of conflicting. Consequence:
  this PR merges after pr-review-workflow (user sequencing decision at merge
  time).
- A2 (accepted): the source document is user-supplied with no license or
  attribution header; the workflow file records provenance as "adapted from a
  user-supplied product-brainstorming skill document (2026-08-05)" and ships
  under the repo's standard MIT frontmatter. No external attribution is
  invented (contrast: pr-review's CC-BY-4.0 base had a known upstream).
- A3 (accepted): discovery is a read-only conversation workflow — it joins the
  read-only complement (no `implementation-delivery.md` reference), like
  `exploration`, `to-prd`, and `the-fool`.
- A4 (accepted): durable memory writes at Capture use existing massa-ai
  `remember` with types `decision`/`pattern` and the required tag set; when
  the MCP server is unavailable the capture summary stays in conversation
  (graceful degradation, no blocking).
- Open: none — all gray areas above are recorded as accepted assumptions for
  this unattended session; the user can override any at review.

## User Stories

1. As a product-minded user, I want a `discovery` route for brainstorming a
   problem or idea, so that pre-spec thinking gets a structured thinking
   partner instead of falling into an implementation workflow.
2. As a user mid-discovery, I want the agent to challenge assumptions and
   push past my first idea, so that I converge on stronger directions than I
   would alone.
3. As a user ending a discovery session, I want an explicit offer to turn the
   conversation into a PRD via `to-prd`, so that captured thinking becomes a
   deliverable only when I say so.
4. As a returning user, I want durable product decisions from past discovery
   sessions recalled at the start of a new one, so that rejected directions
   are not re-litigated.
5. As a maintainer, I want the new workflow enrolled in every existing
   harness gate (frontmatter, intake, count locks, parity, size, duplication),
   so that it cannot silently rot.

## Requirements

### DSC-01 — Workflow file

`skills/massa-ai/workflows/discovery.md` exists with Agent Skills frontmatter
(name `discovery`, double-quoted single-line description, `license: MIT`,
`metadata.version: "1.0.0"`) that parses under `Bun.YAML.parse`.

- AC1: The file contains the literal `references/project-context.md` intake
  line (universal-intake gate).
- AC2: The file does not contain the string
  `references/implementation-delivery.md` (read-only complement membership).
- AC3: The file carries a provenance line naming the user-supplied
  product-brainstorming base document and date.

### DSC-02 — Router registration

`skills/massa-ai/SKILL.md` gains a `discovery` router-table row (placed
before `to-prd` — flow adjacency) and a tier-4 primary-verb precedence
clause: brainstorm/explore a product problem, idea, or direction with no
concrete code target → `discovery`; codebase understanding stays
`exploration`.

- AC1: `grep -n "discovery" skills/massa-ai/SKILL.md` shows exactly the
  table row and the precedence clause (2 intentional sites).
- AC2: `wc -c skills/massa-ai/SKILL.md` ≤ 21000 and the size-budget suite
  stays green.

### DSC-03 — Brainstorming modes

The workflow defines four modes — Problem Exploration, Solution Ideation,
Assumption Testing, Strategy Exploration — each with when-to-use guidance
and what-to-do bullets, plus an instruction to identify the fitting mode and
shift modes as the conversation evolves.

- AC1: All four mode names appear as headings with non-empty bodies.

### DSC-04 — Frameworks as tools

The workflow carries the seven frameworks from the base document — How Might
We, Jobs-to-be-Done, Opportunity Solution Trees, First Principles
Decomposition, SCAMPER, OODA Loop, Reverse Brainstorming — compressed, with
the explicit rule that frameworks are thinking tools pulled in when they
help, never a checklist to work through.

- AC1: All seven framework names appear; the no-framework-dumping rule is
  stated.

### DSC-05 — Session rhythm

The workflow defines the five-stage session structure Frame → Diverge →
Provoke → Converge → Capture, with Capture mandatory (key ideas, assumptions
to test, questions to research, next steps, explicitly-set-aside ideas).

- AC1: All five stage names appear in order with non-empty bodies.
- AC2: Capture's output list includes assumptions-to-test and set-aside
  ideas.

### DSC-06 — Thinking-partner conduct

The workflow states the conduct contract: be opinionated, challenge
constructively, bring unexpected angles, match energy, ask the next
question, name the PM trap; and the prohibitions: no framework dumping, no
list-and-hand-over, no universal agreement, no premature feasibility, no
anchoring on the first idea, brainstorming is not decision-making. The six
anti-patterns from the base document are carried with their counters.

- AC1: Do and Do-Not sections exist; all six anti-patterns appear.

### DSC-07 — massa-ai integration

The workflow binds to the massa-ai runtime contract: `workflowSessionId`
`discovery-<entity>`; budgeted `recall` at session start (prior product
decisions, rejected directions); Capture persists durable decisions and
tested assumptions via `remember` (types `decision`/`pattern`, required tag
set); graceful degradation when the MCP server is unavailable; Evidence Gate
before claiming the session complete.

- AC1: Session-id convention, budgeted recall, remember-at-Capture, and
  degradation clauses are present.

### DSC-08 — to-prd handoff

The Capture stage ends with a mandatory explicit offer to synthesize the
conversation into a PRD via the `to-prd` workflow. Acceptance satisfies
`to-prd`'s explicit-request routing precondition and routes there carrying
the current conversation context (no new interview); declination leaves the
capture summary in conversation. The offer is mandatory; the PRD is not.

- AC1: The workflow names `to-prd` and `workflows/to-prd.md`, states the
  offer as mandatory, and states that acceptance = the explicit request
  `to-prd` requires.

### DSC-09 — Delivery gates

- AC1: `EXPECTED_WORKFLOW_COUNT` 39→40 in both count-lock suites and the
  read-only complement 23→24, each observed red before the edit and green
  after (observed-red ordering).
- AC2: `bun run generate:artifacts` + `--check` no drift; integrity,
  duplication, parity, and size suites green; `bun scripts/check-skill-doc-paths.ts`
  0 misses; `bun run lint` 0.
- AC3: CHANGELOG entry under `[Unreleased]` → `### Added`.

## Requirement Traceability

| Requirement | User story | Verified by |
| --- | --- | --- |
| DSC-01 | 1, 5 | WMH frontmatter suite (population 40) + grep sensors (tasks.md matrix) |
| DSC-02 | 1 | grep 2 sites + byte count + size-budget suite |
| DSC-03 | 2 | clause-by-clause read (validation.md records each) |
| DSC-04 | 2 | clause-by-clause read |
| DSC-05 | 2, 3 | clause-by-clause read |
| DSC-06 | 2 | clause-by-clause read |
| DSC-07 | 4 | clause-by-clause read |
| DSC-08 | 3 | clause-by-clause read + to-prd literal grep |
| DSC-09 | 5 | count suites red→green + full gate matrix |
