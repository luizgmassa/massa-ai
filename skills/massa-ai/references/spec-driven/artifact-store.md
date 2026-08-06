# Spec-Driven Artifact Store

Use before any spec-driven workflow reads or writes feature registry, progress, handoff, phase artifacts, validation reports, or lessons. `.specs/` files are the canonical state layer for spec-driven logical artifacts.

## Source Of Truth

The canonical-store principle, the STATE Precedence Chain, and the unwritable-→-block rule live in `references/artifact-persistence.md` — they apply to every workflow family, not just spec-driven. This store applies them to spec-driven's logical paths below. Canonical ownership and full section rules live in `references/spec-driven/memory.md`.

## Logical Paths

Use these logical paths:

- `.specs/project/FEATURES.json` — feature registry, `active_feature`, status, dependencies
- `.specs/project/STATE.md` — current objective, progress, blockers, decisions, next step
- `.specs/HANDOFF.md` — session handoff state
- `.specs/features/<slug>/spec.md` — feature specification
- `.specs/features/<slug>/context.md` — feature context
- `.specs/features/<slug>/design.md` — feature design
- `.specs/features/<slug>/tasks.md` — feature tasks
- `.specs/features/<slug>/validation.md` — feature validation report
- `.specs/quick/NNN-slug/TASK.md` — quick-mode task (one-line intent + acceptance)
- `.specs/quick/NNN-slug/SUMMARY.md` — quick-mode result (files changed + gate evidence)
- `.specs/lessons.json` — the single lessons store, machine-owned (managed by `lessons.ts`); `lessons list` is the on-demand view

## Quick Artifacts

Quick-mode tasks (Quick mode guardrails in `workflows/spec-driven.md`) live under `.specs/quick/NNN-slug/` with the two-file templates in `references/artifact-persistence.md` (Quick Artifact Templates). Spec-driven specifics on top: quick tasks are also listed in the STATE.md Quick Tasks table (see `references/spec-driven/memory.md`), and when 5+ quick tasks accumulate in one area, promote to a feature — move the work under `.specs/features/<slug>/` and record the promotion in STATE.

## Reading Artifacts

Load only what you need. Prefer metadata-only inspection before loading full content.

- **Feature registry status:** `bun -e "const d=await Bun.file('.specs/project/FEATURES.json').json(); console.log('active:', d.active_feature); for (const f of d.features??[]) console.log(f.id, f.status);"`
- **Full feature registry:** `cat .specs/project/FEATURES.json`
- **Project state:** `cat .specs/project/STATE.md`
- **Handoff:** `cat .specs/HANDOFF.md`
- **Feature spec:** `cat .specs/features/<slug>/spec.md`
- **Confirmed lessons:** `bun skills/massa-ai/scripts/lessons.ts --root . list --status confirmed [--scope <relevant>]`

## Writing Artifacts

Write artifacts directly to `.specs/` files. Use a here-doc or `printf` for Markdown, or `bun -e` for JSON mutations.

- **Update state:** `printf '...' > .specs/project/STATE.md`
- **Update handoff:** `printf '...' > .specs/HANDOFF.md`
- **Write feature artifact:** `printf '...' > .specs/features/<slug>/design.md`
- **Update feature registry:** use `bun -e` to read-modify-write `FEATURES.json`

Feature activate/complete flows update `.specs/project/FEATURES.json`, `.specs/project/STATE.md`, and `.specs/HANDOFF.md` through file writes.

## Versioning

- Feature artifacts under `.specs/features/<slug>/` are versioned by design (one file per slug).
- `.specs/project/FEATURES.json` and `.specs/project/STATE.md` are append-only versioned by their git history.
- `lessons.json` versioning is managed automatically by `lessons.ts`.
- When content must be superseded (e.g., a decision), update the existing file and rely on git history for the prior version.

## Debug Exports

Exports under `.specs-exports/` are optional, untracked review aids. Use `cp -r .specs/ .specs-exports/` for human inspection. Exports are never runtime fallback, never canonical input, and never completion evidence.

## Failure Handling

- `.specs/` directory missing or not writable: block spec-driven state mutation; do not fall back to memory or chat.
- Required artifact missing: create it on first write or block unless it is an approved initial creation.
- `lessons.ts` unavailable: skip lessons loading/recording, record skipped reason in validation report.
.specs/ files
