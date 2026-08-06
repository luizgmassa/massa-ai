# Implementation Delivery Protocol

Use in every implementation workflow, before the first repository
mutation. Defines how verified work leaves the agent's hands: isolated in a
worktree, committed atomically, pushed, proposed as a pull request, watched
through CI, repaired if red — and merged only after the user says so.

Read-only workflows (`*-audit`, `exploration`, `the-fool`) never load this file.
They do not mutate, so they have nothing to deliver.

## Principle

Work that is not isolated, not pushed, and not tested by CI is not delivered — it
is a local opinion. The protocol turns "I finished" into "CI agrees, and a
human chose to merge it".

## The Chain

| # | Stage | Command | On failure |
| --- | --- | --- | --- |
| 0 | Preflight | `git rev-parse --is-inside-work-tree`; `command -v gh`; `gh auth status` | Record which capabilities are absent and select the degraded path below |
| 1 | Isolate | `git fetch origin <base> && git worktree add -b <type>/<slug> <path> origin/<base>` | Branch name taken → suffix `-2`. Worktree path taken → reuse it only if its branch matches |
| 2 | Implement | one task → gate → `git commit` | Gate red → fix before committing. Never commit through a failing gate |
| 3 | Push | `git push -u origin <type>/<slug>` | Rejected non-fast-forward → `git fetch` + rebase, never force-push a shared branch |
| 3.5 | Deliver specs | `bun skills/massa-ai/scripts/check_specs_delivered.ts <feature> [--root .]` | Non-zero → commit the missing `.specs/` updates (a `docs(specs):`-type commit is normal), push, re-run. Defensive fallback — should not fire when the close-out task already committed `.specs/` before the first push |
| 4 | Propose — precondition: Stage 3.5 (`check_specs_delivered.ts`) green | `gh pr create --base <base> --title <t> --body <b>` | `gh` absent/unauthenticated → degraded path |
| 5 | Watch | `gh pr checks --watch` | No checks configured → say so; do not claim CI passed |
| 6 | Repair | fix on the branch, commit, return to stage 5 | Capped at 3 iterations, then stop as `Blocked` |
| 7 | **Ask** | report the PR URL and the green check list, then **stop** | — |

### Stage 1 — worktree isolation is mandatory

Every implementation task runs in its own git worktree. **Mandatory worktree
creation is the rule, not a preference:** a one-line typo fix is isolated
exactly like a twelve-file feature. There is **no size exemption**. The reason
is that the exemption, not the ceremony, is what costs time — "this one is too
small to isolate" is the judgment call that puts half-finished work on a shared
branch. Worktree creation happens **before the first repository mutation**, not
after implementation.

The only two legal skip reasons:

1. The target is not a git repository.
2. The user explicitly declined isolation for this task.

Record the skip reason verbatim in the completion report. Any other reason is a
protocol violation, not a shortcut.

Set up the worktree's dependencies before the first gate — a fresh worktree has
no `node_modules`, no `dist`, and no `.env`. A gate that fails only because the
worktree was never provisioned is an environment failure; say so rather than
reporting it as a code failure.

**Phased work — one branch per Phase/Wave.** When the work is phased (sourced
from `workflows/ticket.md`, a spec-driven `tasks.md` with Phases/Waves, a TDD
PR-group table, or a `references/pr-task-fix.md` PR-group split), create
**one branch per Phase/Wave**, not one branch per task
and not one branch for the whole feature. All Phases/PR groups of one feature
share that feature's single Stage 3 delivery authorization — one go-ahead
covers every group's commits, pushes, and PR creation. Name the branch with the phase's Jira
Task key, e.g. `feat/<PHASE-KEY>-<slug>` (so `feat/SA-100-phase-1-search-split`
for phase SA-100). The phase key comes from `workflows/ticket.md` or the user.
Each Task inside the phase is then one atomic commit on that branch, prefixed
with its own sub-task key — the commit contract is owned by
`workflows/commit.md`; do not restate it here. Non-phased work keeps the
`<type>/<slug>` branch shape unchanged.

### Stage 2 — one commit per task

Commit message content, staging rules, audit-report exclusions, and Jira
prefixes are owned by `workflows/commit.md`. Do not restate them here; invoke
that workflow. This reference owns only the cadence: **one atomic commit per
completed task, after its gate passes.** Never batch tasks into one commit and
never commit a task whose gate is red.

### Stage 3 — push carries the feature's delivery authorization

One explicit delivery authorization per feature, obtained before implementation begins, covers task commits, the branch push, and `gh pr create` for that feature — a single approval, not a push-by-push confirmation. Force-push, deploy, production database changes, merges, and any other remote/externally-visible/destructive operation always require a separate explicit go-ahead, even after that authorization. Workflows that gate Execute behind a batch/delegation offer (e.g. `workflows/spec-driven.md`) obtain this authorization at that same moment.

### Stage 3.5 — deliver specs before PR (defensive fallback)

Between Push and Propose, all feature `.specs/` artifacts (`spec/context/design/tasks/validation` as applicable), `.specs/project/STATE.md`, `.specs/HANDOFF.md`, and `.specs/project/FEATURES.json` must be updated and committed on the branch. **Deterministic backing (run it, do not eyeball it):** `bun skills/massa-ai/scripts/check_specs_delivered.ts <feature> [--root .]` — a non-zero exit blocks Propose. If no code-execution tool is available, run the same checks by reading the artifact (graceful degradation preserved).

**Nominal path: this stage should never fire.** The feature's own close-out task (the last task before delivery — see `workflows/spec-driven.md` step 7) commits `.specs/` updates **before** the first push, so stage 3.5's remediation is a defensive fallback for the rare case something slipped through, not the normal place `.specs/` gets committed. On failure: commit the missing `.specs/` updates (a `docs(specs):`-type commit is normal), push, re-run this stage. No commits may land between the close-out commit and PR creation.

**Kind variants.** `check_specs_delivered.ts` takes `--kind feature|quick|debug|refactor` (default `feature`, the behavior above): `quick` gates `.specs/quick/<slug>/` `TASK.md`+`SUMMARY.md`, `debug` gates `.specs/debug/<slug>/REPORT.md`, `refactor` gates `.specs/refactors/<slug>/CHARACTERIZATION.md` (plus `PLAN.md`/`SENSOR.md` when present) — none of the non-feature kinds require the project STATE files. The fix-family analogue of this stage is `bun skills/massa-ai/scripts/check_fix_closure.ts <closure.md> --family <family>` (Fix Closure Report Contract in `references/audit-report-io.md`). Neither gate fires for a workflow run with no durable artifact in scope.

### Stage 4 — propose carries the phase key prefix

The PR/MR is created with `gh pr create --base <base> --title <t> --body <b>`.
For **phased work**, the PR title and body include the Phase/Wave Jira Task key
prefix, matching the branch naming (the branch is named with that phase key per
Stage 1). Source the key from the branch; do not ask the user again. Example
title: `[SA-100] Phase 1: search facade split`. The per-task commit prefixes on
the branch are owned by `workflows/commit.md`; this stage owns only the PR-level
phase prefix. Non-phased work keeps the existing PR title behavior unchanged.

### Stages 3–7 — the PR description stays current

The PR description is a living artifact, not a creation-time snapshot. After
**every push requested while the PR exists** — repair iterations, follow-up
tasks, review-requested changes — update the PR description with
`gh pr edit <number> --body <b>` so it reflects the branch's current commit
set, scope, and evidence **before** returning to Watch. The description must be
current before the merge decision is requested; a merge may never be proposed
over a description that describes an older state of the branch. When generated
or bundled files are regenerated alongside source edits, the description names
that blast radius explicitly so reviewers do not undercount the diff.

### Stage 7 — merge is never automatic

Do not run `gh pr merge` without explicit user approval given in the current
session. Approval for one PR does not carry to the next. When CI is green,
report:

- the PR URL,
- the check names that passed,
- what is still unverified (skipped jobs, absent checks),
- the change's category trust status (`bun skills/massa-ai/scripts/lessons.ts --root . trust status --category <kebab>`) as advisory reading-depth context — it never substitutes for the approval decision below,

then stop and ask. If the user approves, merge with the repository's configured
strategy and delete the branch. If the repository auto-releases on merge, say so
in the same message — the user is approving a release, not just a merge.

## Degraded Paths

| Missing capability | Behavior |
| --- | --- |
| `gh` not installed or not authenticated | Run stages 0–3, then stop. Report the pushed branch and the exact `gh pr create` command the user can run. Record `pr: skipped — gh unavailable` |
| No remote configured | Run stages 0–2. Report local commits and the branch name. Record `push: skipped — no remote` |
| Not a git repository | Run stage 2's gate discipline only. Record `isolation: skipped — not a repository` |
| Repository has no CI | Run stages 0–4, then stop at stage 7 with `ci: no checks configured` |
| CI is red after 3 repair iterations | Stop as `Blocked`. Preserve the failing check output and the hypotheses already ruled out; do not merge, do not disable the check |

A skipped stage is always reported. Silence reads as success, and a stage that
silently did not run is worse than one that loudly failed.

## Anti-Patterns

- Committing directly to `main` or the default branch.
- Force-pushing a branch that has an open PR.
- Weakening, skipping, or deleting a test to turn CI green — see
  `references/root-cause-scripts.md` when a check keeps failing.
- Merging because CI passed. CI passing is the precondition for asking, not the
  approval itself.
- Reporting "done" while the branch is unpushed.
- Proposing or performing a merge while the PR description still describes an
  older commit set — update it after each requested push, before merging.

## Completion Evidence

The delivery section of the Evidence Gate reports, in one block: worktree path,
branch, commit hashes with their tasks, PR URL, CI verdict per check, repair
iterations used, skipped stages with reasons, and the merge decision (approved,
declined, or awaiting the user).
