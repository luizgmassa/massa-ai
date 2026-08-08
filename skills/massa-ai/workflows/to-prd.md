---
name: to-prd
description: "Turn the current conversation into a PRD. Use when the user asks to create, synthesize, or convert existing discussion and codebase context into a Product Requirements Document without another interview. Do NOT use for implementation plans, architecture design docs, RFCs, TDDs, or discovery interviews that require new product questioning."
license: MIT
metadata:
  version: "1.2.0"
---

### To-PRD (Conversation → Product Requirements Document)

This skill takes the current conversation context and codebase understanding and produces a PRD. Do NOT interview the user — just synthesize what you already know. The PRD follows the same pattern as `references/spec-driven/specify.md`: definitions, required sections, and directions are shared so a PRD produced here is structurally consistent with a feature spec produced by spec-driven Specify.

Route here only on explicit user request to convert the current conversation into a PRD (Product Requirements Document); refining an existing PRD stays `furps-refinement`.

Load `references/project-context.md` (intake sweep) before the first substantive read.

## Definitions

The PRD uses a small set of fixed terms. Each resolves to exactly one shape, so a PRD is testable and traceable from conversation to validation. The canonical definitions of **EARS** (Easy Approach to Requirements Syntax) and the **Implicit-Requirement Dimensions** rubric live in `references/spec-driven/specify.md`; this workflow references them rather than duplicating them. The definitions below are PRD-specific or carry PRD-specific extensions.

### PRD (Product Requirements Document)

The output artifact. It captures WHAT to build — problem, goals, user stories with acceptance criteria, edge cases, requirement traceability, and success criteria — plus the implementation and testing decisions the conversation already reached. It does not capture HOW (architecture, interfaces, data models) beyond the decision-level notes below; that belongs in a later Design phase.

### Requirement ID

Every requirement gets a unique, trackable ID of the form `[CATEGORY]-[NUMBER]` (e.g., `AUTH-01`, `CART-03`, `NOTIF-02`). The category is a short uppercase prefix for the feature area; the number is zero-padded within the feature. IDs are stable across Design, Tasks, and Validation — a PRD never re-uses or renumbers an ID once written.

**ID format:** `[A-Z][A-Z0-9]*-\d+` — one uppercase prefix, one hyphen, one or more digits.

### Priority

Each user story carries a priority that determines delivery order.

- **P1 = MVP** — must ship; a complete, demo-able vertical slice, not just backend or frontend.
- **P2** — should have; important but not MVP.
- **P3** — nice to have.

Each story MUST be independently testable — you can implement and demo just that story.

### EARS

Every acceptance criterion is written in EARS (Easy Approach to Requirements Syntax), which resolves to exactly one of six patterns: Ubiquitous, Event-driven (WHEN), State-driven (WHILE), Optional-feature (WHERE), Unwanted-behavior (IF/THEN), and Complex (combination). **See `references/spec-driven/specify.md` §EARS for the canonical patterns table** — choose the pattern that fits the requirement; never force everything into a single shape.

### Implicit-Requirement Dimensions

The canonical rubric for requirements that are easy to miss covers nine dimensions: input validation & bounds, failure/partial-failure states, idempotency/retry/duplicate handling, auth boundaries & rate limits, concurrency/ordering, data lifecycle/expiry, observability, external-dependency failure, and state-transition integrity. **See `references/spec-driven/specify.md` §Implicit-Requirement Dimensions for the canonical table.** Apply the sweep before the PRD closes so a dimension is never silently dropped.

### Seam

A boundary at which the feature is tested. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better — the ideal number is one. Record the seams in the PRD.

## Required Sections

The PRD must include every section below. They mirror `references/spec-driven/specify.md`'s required sections, so a PRD and a feature spec are structurally interchangeable and `bun skills/massa-ai/scripts/validate_spec.ts` can check either.

- Feature name and slug.
- Problem statement.
- Goals.
- Out of scope table.
- Assumptions & Open Questions table.
- User stories with priorities (P1/P2/P3).
- Acceptance criteria in EARS, linked to requirement IDs.
- Edge cases and failure modes.
- Requirement traceability table.
- Success criteria.
- Implementation Decisions.
- Testing Decisions.
- Further Notes.

## Process

### 1. Explore the Repo

Understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the PRD, and respect any ADRs (Architecture Decision Records) in the area you're touching. Resolve anything discoverable from the code yourself through the Knowledge Verification Chain — do not spend the user's attention asking for it.

### 2. Sketch the Seams

Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better — the ideal number is one.

Record the seams in the PRD and proceed from the current context unless the user explicitly asks to review them first.

### 3. Synthesize the PRD (No Interview)

Write the PRD from the conversation context and codebase understanding already in hand. Do NOT interview the user. If the conversation did not surface something a required section needs, record it as an accepted assumption (the closure gate below) — do not ask a new question to fill the gap.

### 4. Implicit-Requirement Sweep

Before the PRD closes, check each Implicit-Requirement Dimension (see `references/spec-driven/specify.md` for the canonical rubric) and either produce a requirement, an accepted assumption, an explicit out-of-scope row, or an `N/A because <reason>` entry. This prevents inventing requirements to fill the checklist while ensuring no dimension is silently dropped. Bound the sweep to THIS feature's scope; never add requirements outside the feature boundary.

### 5. Requirement Closure Gate (Before Confirm)

The PRD is not presentable for confirmation until every item below is resolved. This is the same gate spec-driven Specify runs, adapted for synthesize-only operation (no new interview).

1. **List every open requirement question** that surfaced during synthesis.
2. **Resolve each question from the conversation** when it changes behavior, scope, data, security/privacy, compatibility, or acceptance criteria. Do NOT ask the user a new question — the conversation is the only source.
3. **Unambiguity + precision (hard).** Every AC must (a) have a single interpretation and (b) define a precise, spec-defined expected outcome. Any AC that fails either check: split it, or log it as an explicit assumption with the chosen interpretation and rationale.
4. **Open-questions / assumptions closure.** Each unresolved question must be recorded as an **assumption** (chosen default + rationale) in the Assumptions & Open Questions section. Nothing proceeds unmarked.
5. **Continue only when** the Open Questions table reads `none` or every row has an accepted assumption.

### 6. Deterministic Backing (Run It, Do Not Eyeball It)

```bash
bun skills/massa-ai/scripts/validate_spec.ts <feature> [--root .]
```

`validate_spec.ts` checks that required sections exist, every AC is EARS-shaped (has a SHALL), no Assumptions row has an empty default or rationale, and requirement IDs are well-formed. A non-zero exit means fix before confirming — the script checks structure; the judgment calls (is the interpretation right, is the outcome precise) stay yours. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).

### 7. English Naming

Apply the English-conversion rule from `references/naming-standards.md` to every identifier, requirement name, and artifact-facing term before writing the PRD — convert any non-English source term before it reaches this artifact.

## Directions

- **One requirement per criterion.** Never bundle two behaviors in one AC; split it.
- **Every AC has a SHALL.** A criterion without a SHALL is not testable. `validate_spec.ts` flags it.
- **Concrete values, not adjectives.** A specific status code, a specific message, a bound — not "quickly" or "gracefully."
- **Requirement IDs are mandatory.** Every story maps to trackable IDs; IDs are stable and never renumbered.
- **EARS patterns map to dimensions.** State-transition integrity → State-driven; failure and external-dependency failure → Unwanted-behavior; feature flags → Optional-feature. Pick the pattern that fits.
- **Edge cases are criteria.** Edge cases are usually Unwanted-behavior (IF/THEN) or boundary (WHEN) criteria — write them as ACs, not as prose.
- **Out of Scope prevents creep.** If it is not in the PRD, it does not get built. Documented to prevent scope creep.
- **Synthesize-only closure.** The gate resolves from conversation context; it never asks a new interview question. Declined or undiscussed gray areas become accepted assumptions with rationale, never silently dropped.
- **No file paths or code snippets in Implementation Decisions.** They go stale quickly. Exception: a prototype snippet that encodes a decision more precisely than prose (state machine, reducer, schema, type shape) — inline it within the relevant decision, note it came from a prototype, and trim to the decision-rich parts.

## PRD Template

Start from the `spec.md` template in `references/spec-driven/specify.md` (the "Template: `.specs/features/<slug>/spec.md`" section near the end of that file). That template covers Problem Statement, Goals, Out of Scope, Assumptions & Open Questions, User Stories (P1/P2/P3 with EARS ACs), Edge Cases, Requirement Traceability, and Success Criteria — all structurally identical to what a PRD needs. The PRD template below extends that base with three to-prd-specific additions and one modification.

**Modification to the base template's Problem Statement:** phrase it from the user's perspective — the problem the user is facing, not just the system gap.

**Add the following three sections after Success Criteria:**

````markdown
## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

---

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)
- The seams at which the feature will be tested (see the seam sketch above)

---

## Further Notes

Any further notes about the feature.
````

Apply the `ready-for-agent` triage label — no need for additional triage.

## Tips

- **P1 = Vertical Slice** — A complete, demo-able feature, not just backend or frontend.
- **EARS is code** — If you can't write a criterion as a test, rewrite it; pick the pattern (WHEN / WHILE / WHERE / IF / ubiquitous) that fits.
- **Requirement IDs are mandatory** — Every story maps to trackable IDs; IDs are stable and never renumbered.
- **Edge cases matter** — What breaks? What's empty? What's huge? Write them as ACs, not prose.
- **Out of Scope prevents creep** — If it's not here, it doesn't get built.
- **Synthesize-only** — Do NOT interview. The conversation is the only source; unresolved gaps become accepted assumptions, never new questions.
- **Closure gate before confirm** — No unresolved-and-unmarked items remain before the PRD is presented.
- **Confirm after the gate passes** — Present the PRD for user confirmation only after the closure gate passes and `validate_spec.ts` exits clean.

## Done

To-PRD is done when every requirement has an ID, acceptance criteria are testable EARS statements, edge cases are named, out-of-scope boundaries are explicit, implicit-requirement dimensions are resolved or marked `N/A because <reason>`, the Requirement Closure Gate is satisfied, and `validate_spec.ts` exits clean (or the no-code-execution-tool fallback was applied).

## Massa-ai Integration

- **Code analysis:** Use massa-ai tools first (`list_projects`, `search`, `project_map`, `optimized_context`) before `ast-grep`/`rg`/`grep` for the explore step. Current source overrides a stale index or memory (source-precedence rule).
- **Memory:** Persist verified outcomes worth reusing with `remember`, tagging `project:<id>`, `session:<id>`, `workflow:to-prd`, `entity:<slug>`, `memory:working|episodic|semantic|procedural`.
- **Validation:** Evidence-or-zero. Every requirement resolved and assumption logged is checked against current source.
<!-- validator anchors: references/project-context.md | read-only workflow | no implementation-delivery/code-annotation/root-cause-scripts | no Isolation Gate | no Reuse Scan -->