# SUMMARY: to-prd workflow follows spec-driven pattern

**Files changed:** 1
- `skills/massa-ai/workflows/to-prd.md` — rewrote to follow spec-driven pattern

**Quick artifact:** `.specs/quick/012-to-prd-pattern/TASK.md`

## What changed

`to-prd.md` rewritten so the PRD it produces follows the same pattern as `references/spec-driven/specify.md`:

- **Definitions added:** PRD, Requirement ID (`[CATEGORY]-[NUMBER]`, format `[A-Z][A-Z0-9]*-\d+`), Priority (P1 MVP / P2 / P3, independently testable), EARS (patterns table: Ubiquitous/Event-driven/State-driven/Optional-feature/Unwanted-behavior/Complex), Implicit-Requirement Dimensions (9-row rubric), Seam.
- **Required Sections added:** Feature name+slug, Problem Statement, Goals, Out of Scope, Assumptions & Open Questions, User Stories (P1/P2/P3), Acceptance Criteria (EARS + IDs), Edge Cases, Requirement Traceability, Success Criteria, Implementation Decisions, Testing Decisions, Further Notes.
- **Process rewritten:** Explore → Sketch seams → Synthesize (no interview) → Implicit-Requirement sweep → Requirement Closure Gate (synthesize-only) → Deterministic backing (`validate_spec.ts`) → English naming.
- **Directions added:** one behavior per criterion, SHALL mandatory, concrete values, ID stability, EARS-to-dimension mapping, edge cases as ACs, Out of Scope anti-creep, synthesize-only closure, no file paths/snippets (prototype exception kept).
- **PRD Template** expanded to match spec-driven `spec.md` shape, with `ready-for-agent` triage label kept.
- **Tips / Done / Massa-ai Integration** sections added (mirror specify.md).
- `metadata.version` bumped 1.0.0 → 1.1.0 (lesson L-018: body change bumps version).

## Gate evidence

```
rtk bun test scripts/__tests__/workflow-harness-contract.test.ts scripts/__tests__/workflow-metadata-headers.test.ts
→ 110 pass, 0 fail, 200 expect() calls
→ [workflow-metadata-headers] checked 40 file(s): ... skills/massa-ai/workflows/to-prd.md
```

- WMH frontmatter parses via `Bun.YAML.parse` (name=to-prd, single-line desc, license MIT, version 1.1.0).
- Universal intake: `references/project-context.md` present (no-workflow-missing test green).
- Read-only: no `implementation-delivery.md`, `code-annotation.md`, `root-cause-scripts.md` (mutation-scoped refs test green); no Isolation Gate line (leak test green); no Reuse Scan line (reuse mandate scoped to 16 impl workflows only).
- Workflow count stays 40 (both tests assert `EXPECTED_WORKFLOW_COUNT === 40`).
- No router table or other workflow file changed.

## Residual risk

None found. Single workflow-file edit, no new dependency, no design decision, no repository mutation outside the workflow doc.