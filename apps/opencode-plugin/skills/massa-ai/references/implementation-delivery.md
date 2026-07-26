# Implementation Delivery Protocol

Use this reference in every implementation workflow, before the first repository
mutation. It defines how verified work leaves the agent's hands: isolated in a
worktree, committed atomically, pushed, proposed as a pull request, watched
through CI, repaired if red — and merged only after the user says so.

Read-only workflows (`*-audit`, `exploration`, `the-fool`) never load this file.
They do not mutate, so they have nothing to deliver.

## Principle

Work that is not isolated, not pushed, and not tested by CI is not delivered —
it is a local opinion. The protocol turns "I finished" into "CI agrees, and a
human chose to merge it".

## The Chain

| # | Stage | Command | On failure |
| --- | --- | --- | --- |
| 0 | Preflight | `git rev-parse --is-inside-work-tree`; `command -v gh`; `gh auth status` | Record which capabilities are absent and select the degraded path below |
| 1 | Isolate | `git fetch origin <base> && git worktree add -b <type>/<slug> <path> origin/<base>` | Branch name taken → suffix `-2`. Worktree path taken → reuse it only if its branch matches |
| 2 | Implement | one task → gate → `git commit` | Gate red → fix before committing. Never commit through a failing gate |
| 3 | Push | `git push -u origin <type>/<slug>` | Rejected non-fast-forward → `git fetch` + rebase, never force-push a shared branch |
| 4 | Propose | `gh pr create --base <base> --title <t> --body <b>` | `gh` absent/unauthenticated → degraded path |
| 5 | Watch | `gh pr checks --watch` | No checks configured → say so; do not claim CI passed |
| 6 | Repair | fix on the branch, commit, return to stage 5 | Capped at 3 iterations, then stop as `Blocked` |
| 7 | **Ask** | report the PR URL and the green check list, then **stop** | — |

### Stage 1 — worktree isolation is mandatory

Every implementation task runs in its own git worktree. There is **no size
exemption**: a one-line typo fix is isolated exactly like a twelve-file feature.
The reason is that the exemption, not the ceremony, is what costs time —
"this one is too small to isolate" is the judgment call that puts half-finished
work on a shared branch.

The only two legal skip reasons:

1. The target is not a git repository.
2. The user explicitly declined isolation for this task.

Record the skip reason verbatim in the completion report. Any other reason is a
protocol violation, not a shortcut.

Set up the worktree's dependencies before the first gate — a fresh worktree has
no `node_modules`, no `dist`, and no `.env`. A gate that fails only because the
worktree was never provisioned is an environment failure; say so rather than
reporting it as a code failure.

### Stage 2 — one commit per task

Commit message content, staging rules, audit-report exclusions, and Jira
prefixes are owned by `workflows/commit.md`. Do not restate them here; invoke
that workflow. This reference owns only the cadence: **one atomic commit per
completed task, after its gate passes.** Never batch tasks into one commit and
never commit a task whose gate is red.

### Stage 7 — merge is never automatic

Do not run `gh pr merge` without explicit user approval given in the current
session. Approval for one PR does not carry to the next. When CI is green,
report:

- the PR URL,
- the check names that passed,
- what is still unverified (skipped jobs, absent checks),

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

## Completion Evidence

The delivery section of the Evidence Gate reports, in one block: worktree path,
branch, commit hashes with their tasks, PR URL, CI verdict per check, repair
iterations used, skipped stages with reasons, and the merge decision (approved,
declined, or awaiting the user).
