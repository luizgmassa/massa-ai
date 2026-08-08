# TASK: to-prd workflow follows spec-driven pattern

**Intent:** Rewrite `skills/massa-ai/workflows/to-prd.md` so the PRD it produces follows the same pattern as `references/spec-driven/specify.md` — definitions (EARS, Requirement ID, Priority, Implicit-Requirement Dimensions, Seam), sections (Problem Statement, Goals, Out of Scope, Assumptions & Open Questions, User Stories with P1/P2/P3, Edge Cases, Requirement Traceability, Success Criteria, plus to-prd's own Implementation Decisions, Testing Decisions, Further Notes), and directions (EARS rules, ID format, closure gate, deterministic backing via `validate_spec.ts`, English naming).

**Acceptance:**
- `to-prd.md` keeps valid WMH frontmatter (name=to-prd, single-line desc 20–1024, license MIT, metadata.version bumped 1.0.0 → 1.1.0).
- `to-prd.md` keeps the intake line `references/project-context.md`.
- `to-prd.md` stays read-only: no `implementation-delivery.md`, `code-annotation.md`, `root-cause-scripts.md`, Isolation Gate, or Reuse Scan line.
- PRD template includes Problem Statement, Goals, Out of Scope, Assumptions & Open Questions, User Stories (P1/P2/P3 + EARS ACs + Requirement IDs + Independent Test), Edge Cases, Requirement Traceability, Success Criteria, Implementation Decisions, Testing Decisions, Further Notes.
- Process section defines EARS (patterns table), Requirement ID (`CATEGORY-NN`), Priority, Implicit-Requirement Dimensions, Seam.
- Directions include: one behavior per criterion, SHALL mandatory, concrete values, closure gate (synthesize-only — no new interview), deterministic backing via `bun skills/massa-ai/scripts/validate_spec.ts`, English-conversion rule.
- `bun run test:scripts` (workflow-harness-contract + workflow-metadata-headers) green.
- No change to router table or any other workflow file.