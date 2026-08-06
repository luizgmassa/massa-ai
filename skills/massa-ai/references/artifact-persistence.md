# Artifact Persistence

Use before any workflow reads or writes durable `.specs/` artifacts. This file owns the canonical-store mechanics shared by every workflow family. Logical paths stay per-workflow-owned: spec-driven's table lives in `references/spec-driven/artifact-store.md`; other workflows declare their own paths inline (e.g. `.specs/debug/<slug>/REPORT.md`, `.specs/refactors/<slug>/{CHARACTERIZATION,PLAN,SENSOR}.md`, `.specs/quick/NNN-slug/`, `.specs/project/onboarding/{CONCERNS,TESTING}.md`).

## Canonical Store

- Canonical state lives in `.specs/` files tracked in the repository, not massa-ai records, semantic memories, chat summaries, or root aliases.
- Current repository source remains authoritative for implementation/code evidence.
- `search`, `recall`, and durable memories may discover context, decisions, or reusable patterns, but must never reconstruct canonical artifact state.
- If `.specs/` is unavailable or not writable, **block** the workflow's durable-state mutation and record the blocker; do not fall back to memory or chat as a substitute store.

## STATE Precedence Chain

Artifact reads resolve conflicts in this strict order (first match wins): fresh user instruction > approved `.specs/` artifact > STATE/HANDOFF > massa-ai memory. massa-ai memory and external summaries are discovery, not authority. In a repository with no `.specs/project/STATE.md`/`.specs/HANDOFF.md`, the chain simply has fewer links — the ordering is unchanged.

## Quick Artifact Templates

Quick-sized tasks persist under `.specs/quick/NNN-slug/` — `NNN` zero-padded and sequential per project, `slug` the short kebab-case intent. Exactly two files:

**`.specs/quick/NNN-slug/TASK.md`:**

```markdown
# Quick NNN: <one-line intent>

## Acceptance
- <single testable criterion — the gate the Execute step must pass>
```

**`.specs/quick/NNN-slug/SUMMARY.md`:**

```markdown
# Quick NNN: <one-line intent>

## Result
- Status: Complete | Blocked | Partial
- Files changed: <list or "none">
- Gate: <command + pass/fail evidence>
- SPEC_DEVIATION: <none | what diverged and why>
```

Quick artifacts are canonical `.specs/` state — same precedence chain, same section-scoped write rules; they are not a second store. Deterministic backing: `bun skills/massa-ai/scripts/check_specs_delivered.ts <slug> --kind quick`.

## Failure Handling

- `.specs/` directory missing or not writable: block the workflow's durable-state mutation; do not fall back to memory or chat.
- Required artifact missing: create it only through an approved first write; otherwise block and ask for direction.
